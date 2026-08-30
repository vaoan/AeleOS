import { expect, test, type Locator, type Page } from "@playwright/test";
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
  apart,
  contrast,
  sampleColours,
  textColour,
  type Probe,
} from "./support/pixels";
import { chooseNewSectionSpaces } from "./support/editor";

// One sign-in for the whole file: every case below signs in as the
// same shared identity and none depends on what an earlier case left
// behind, so they restore one saved session rather than minting a
// fresh ticket each — see `support/shared-session.ts`.
const STATE_PATH = sharedStatePath("section-card-face");

// WHY THIS FILE EXISTS.
//
// **Its subject moved on 2026-08-27 and its questions did not.** It was written
// about a `section-preview-face` — an element the preview tray painted on the
// author's behalf, beneath the real renderer, so a picture could sit under the
// card's own corners at a workable alpha. The editor themes its own document
// now and the tray paints nothing at all: it renders the real section, so every
// question below is asked of `public-section`, the element a visitor's browser
// resolves. `face` is kept as the local name because it is what each assertion
// has always been reaching for — the thing that paints.
//
// `cutout` is the first skin to set `clip-path`. Controls and previews are
// siblings, so the old fault — a clipped card cutting away its own popup — is
// structurally impossible. The first case is a browser-level boundary check:
// the real section receives the clip while the AeleOS card, popup and focus
// treatment remain unclipped.
//
// **The second test is about what the section PAINTS**, and it exists because
// the refactor that fixed the clip moved the paint without measuring it. A
// section's own background picture has to READ in the editor as it reads on the
// public page — which is now true by construction rather than by arrangement,
// since it is the same element on both.
//
// **The third test measures the same boundary under hostile paint, and it
// matters more than it did.** The document wears the author's theme now, so
// every control in the editor is standing on a colour somebody else chose.
// AeleOS controls must clear their contrast targets against anything.
//
// **The fourth test is about the fit control**, and it belongs here because
// this is the file that photographs this element. Two of the three options
// painted the same picture and the third read the SKIN's texture tile.
//
// **A test's own card is the LAST one.** Every page opens carrying the identity
// section the database requires, and `add-section` appends — so `.first()` here
// would reach for the identity section's controls instead, and a page-wide
// `section-style-open` matches two buttons rather than one.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");
test.use({ storageState: STATE_PATH });

/** Tall enough that a popup panel is never merely scrolled out of sight. */
const VIEWPORT = { width: 1280, height: 1400 };

/**
 * A picture the browser fetches without leaving the machine.
 *
 * Served by `page.route` rather than pasted as a `data:` address, because
 * `backgroundImageValue` goes through `safeHttpUrl` and accepts only
 * `http(s)` — which is the contract, not an obstacle to route around. A
 * saturated green nothing in either palette comes near, so a probe landing on
 * it is unambiguous.
 */
const PICTURE = {
  url: "https://example.com/section-face-preview.svg",
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#00c800"/></svg>',
  rgb: [0, 200, 0],
};

/**
 * A picture chosen to be as hard to read on as a picture can be, in BOTH
 * schemes at once.
 *
 * Flat mid-grey rather than the checkerboard a person would actually paste,
 * and both halves of that are deliberate. **Mid-grey is the hostile case**:
 * uncovered, it puts `--ink` at 3.87:1 in light and 3.50:1 in dark, and
 * `--muted` at 1.55:1 and 1.25:1 — all below the 4.5:1 text needs, so a
 * control left transparent over it fails on whichever scheme the suite happens
 * to run in rather than only on one. **Flat** means every probe reads the same
 * colour, so nothing here depends on where a checker's squares landed; the
 * measurement is about what covers the picture, not about the picture.
 */
const HOSTILE = {
  url: "https://example.com/section-legibility.svg",
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#808080"/></svg>',
  rgb: [128, 128, 128],
};

/**
 * What text sits over the picture, and what has to be legible on it.
 *
 * `area` is the element whose PAINTED background is sampled — read off a
 * screenshot, so it is whatever the browser actually composited, not what a
 * declaration claims. `ink` is the element whose resolved `color` is read;
 * usually the same element, since `color` inherits and a label naming none of
 * its own takes its box's. The two differ where a control paints its own,
 * which is how the drag grip's `--muted` is checked against the header's
 * background rather than against its own transparent one.
 *
 * `at` picks a point inside `area` that carries no glyph — a box's own
 * padding, or the empty right-hand end of a full-width input. A probe landing
 * on a letter would read the text colour and report a ratio of 1, which is a
 * failure about the probe rather than about the design.
 *
 * The minimum is WCAG's: 4.5:1 for text, 3:1 for an icon, which is a
 * user-interface component rather than a letterform.
 */
const READABLE: {
  what: string;
  area: string;
  ink: string;
  at: (box: { x: number; y: number; width: number; height: number }) => {
    x: number;
    y: number;
  };
  min: number;
}[] = [
  {
    what: "the section-name, arrangement and shape labels",
    area: "section-header",
    ink: "section-header",
    // Along the row's top edge, above the icon buttons — they are
    // `items-end`, so the strip above them is the row's own background.
    at: (box) => ({ x: Math.round(box.x) + 20, y: Math.round(box.y) + 4 }),
    min: 4.5,
  },
  {
    what: "the drag grip's icon",
    area: "section-header",
    // **`drag-1`, because a grip's test id is its PATH.** The card this test
    // styles is the second section: every page opens carrying the identity
    // section the database requires, and `add-section` appends. `drag-0` is
    // that identity section's grip, which nothing here styled.
    ink: "drag-1",
    at: (box) => ({ x: Math.round(box.x) + 20, y: Math.round(box.y) + 4 }),
    min: 3,
  },
  {
    what: "a leaf's field labels",
    area: "leaf-editor",
    ink: "leaf-editor",
    // Inside the box's own `p-2.5`, at half height, so it is clear of both
    // the rounded corners and every field inside.
    at: (box) => ({
      x: Math.round(box.x) + 5,
      y: Math.round(box.y + box.height / 2),
    }),
    min: 4.5,
  },
  {
    what: "a leaf's title field",
    area: "leaf-title",
    ink: "leaf-title",
    // The empty right-hand end of a full-width input. Eight pixels in, which
    // is clear of the inset focus ring's 3–6px band as well as of the text.
    at: (box) => ({
      x: Math.round(box.x + box.width) - 8,
      y: Math.round(box.y + box.height / 2),
    }),
    min: 4.5,
  },
  {
    what: "a leaf's description field",
    area: "leaf-description",
    ink: "leaf-description",
    at: (box) => ({
      x: Math.round(box.x + box.width) - 8,
      y: Math.round(box.y + box.height / 2),
    }),
    min: 4.5,
  },
  {
    what: "the add-place button",
    area: "add-place",
    ink: "add-place",
    // Inside its `px-3`, left of the plus icon. Its text is `--muted`, the
    // dimmest the design puts anywhere, so it is the first thing to fail.
    at: (box) => ({
      x: Math.round(box.x) + 6,
      y: Math.round(box.y + box.height / 2),
    }),
    min: 4.5,
  },
];

/**
 * The darkest pixel the browser actually PAINTED inside one element.
 *
 * **Computed style cannot answer the question this file needs answered.**
 * `textColour` reads what the element resolved its `color` to, which stays
 * correct no matter what paints on top of it — so an occluding layer is
 * invisible to it. Measured while this guard was written: with the section's
 * writing veiled to near-white on screen, tray and page still reported the
 * same ink and a contrast of exactly 1.00 against each other.
 *
 * Sampling the rendered image is the only instrument that can see a veil.
 * Darkest rather than mean, because glyphs are a minority of a text box's
 * pixels and antialiasing pulls the average toward the background whether or
 * not anything is wrong.
 *
 * @param page - the page to decode the screenshot in.
 * @param target - the element to photograph.
 * @returns that pixel as `[r, g, b]`.
 */
async function darkestPixel(page: Page, target: Locator): Promise<number[]> {
  const shot = (await target.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let darkest = [255, 255, 255];
    let lowest = Number.POSITIVE_INFINITY;
    for (let at = 0; at < pixels.length; at += 4) {
      const luminance =
        0.2126 * pixels[at] + 0.7152 * pixels[at + 1] + 0.0722 * pixels[at + 2];
      if (luminance < lowest) {
        lowest = luminance;
        darkest = [pixels[at], pixels[at + 1], pixels[at + 2]];
      }
    }
    return darkest;
  }, shot);
}

let identity: TestIdentity | undefined;

test.beforeAll(async ({ browser }) => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  await establishSharedSession(browser, identity.userId, STATE_PATH);
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("author colours and skin change both real previews without restyling the workbench", async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill("themeboundary");
  await page.getByTestId("editor-display-name").fill("Theme boundary");
  await chooseNewSectionSpaces(page, "1");
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("Boundary");
  await page.getByTestId("add-content").last().click();
  await page.getByTestId("leaf-title").last().fill("Previewed");

  const toolbar = page.getByTestId("editor-save");
  const identityInput = page.getByTestId("editor-display-name");
  const sectionInput = page.getByTestId("section-name").last();
  // The section the tray renders. There is no boxed preview host any more —
  // the document carries the theme, so a section inherits it the way a
  // stranger's browser will.
  const sectionPreview = page
    .getByTestId("block-preview")
    .last()
    .getByTestId("public-section");
  // **The page the editor draws, which is the document itself now.** There is
  // no framed second document and no boxed preview host: the editor themes its
  // own `:root` with the draft, exactly as a public route does, so this reads
  // the page content element the editor renders.
  //
  // **This is the guard on the inversion, and it only became one when the
  // document started carrying the theme.** While the app owned the document
  // and each preview was a boxed exception, the workbench assertions below
  // could not fail — a control was safe from an author's palette for a reason
  // that had nothing to do with any containment. They are the real thing now:
  // an author's colours are at `:root`, and `.aeleos-chrome` is the only
  // reason the toolbar and the inputs still read as AeleOS.
  const completePreview = page.getByTestId("page-content");

  /**
   * Reads control properties the live atmosphere must leave unchanged.
   *
   * The custom properties establish which token scope the element inherited;
   * the computed paint establishes that the token was actually consumed.
   * Reading both prevents a literal-colour control and an inherited-but-unused
   * token from each producing a flattering half-answer.
   *
   * @param testId - the element whose workbench paint is under guard.
   * @returns the resolved design tokens and paint.
   */
  const workbenchStyle = (testId: typeof toolbar) =>
    testId.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        accent: style.getPropertyValue("--accent"),
        round: style.getPropertyValue("--skin-round"),
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderTopLeftRadius,
        font: style.fontFamily,
      };
    });

  /**
   * Reads the author tokens a previewed section is expected to resolve.
   *
   * It INHERITS them from `:root` now rather than receiving them from a boxed
   * host, which is the inversion — so a section reading the app's values here
   * means the document is not carrying the draft.
   *
   * @param host - a section the tray renders.
   * @returns the resolved author palette and skin tokens.
   */
  const previewStyle = (host: typeof sectionPreview) =>
    host.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        accent: style.getPropertyValue("--accent"),
        field: style.getPropertyValue("--field"),
        round: style.getPropertyValue("--skin-round"),
      };
    });

  const controlsBefore = await Promise.all([
    workbenchStyle(toolbar),
    workbenchStyle(identityInput),
    workbenchStyle(sectionInput),
  ]);
  const sectionBefore = await previewStyle(sectionPreview);
  const completeBefore = await previewStyle(completePreview);

  await page.getByTestId("theme-open").click();
  await page.getByTestId("gradient-colour").fill("#101a2e");
  await page.getByTestId("theme-accent").fill("#00ff88");
  await page.getByTestId("theme-skin").selectOption("neobrutalism");

  await expect
    .poll(() =>
      Promise.all([
        previewStyle(sectionPreview),
        previewStyle(completePreview),
      ]),
    )
    .not.toEqual([sectionBefore, completeBefore]);
  expect(await previewStyle(sectionPreview)).not.toEqual(sectionBefore);
  expect(await previewStyle(completePreview)).not.toEqual(completeBefore);

  // These are deliberately last: widening the atmosphere stylesheet back to
  // the complete `themeCss` control set makes the toolbar assertion fail first,
  // before either input is consulted, while both preview assertions still pass.
  expect(await workbenchStyle(toolbar)).toEqual(controlsBefore[0]);
  expect(await workbenchStyle(identityInput)).toEqual(controlsBefore[1]);
  expect(await workbenchStyle(sectionInput)).toEqual(controlsBefore[2]);
});

test("cutout clips the real preview while AeleOS controls remain outside that scope", async ({
  page,
}) => {
  // The nebula is a live canvas behind every page, and the halves below
  // compare screenshots separated in time. Reduced motion is the app's own way
  // of holding it still — the sister spec makes the same argument at length.
  await page.emulateMedia({ reducedMotion: "reduce" });
  // A tall viewport so the panel is never merely off-screen — the question
  // here is whether it is painted, and a scrolled-away panel would answer a
  // different one.
  await page.setViewportSize(VIEWPORT);
  // `boundingBox()` reports CSS pixels and `getImageData` indexes device
  // pixels; they agree only at a ratio of one, which is what this project's
  // Playwright device gives. Named here so a change to it fails by name.
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill("clipcheck");
  await page.getByTestId("editor-display-name").fill("Clip check");

  // Built by hand rather than from a template: a template inserts sections as
  // data without touching a single control, which would prove nothing about
  // the control under test.
  await chooseNewSectionSpaces(page, "2");
  await page.getByTestId("add-section").click();

  // Collapsed keeps the control card compact while its sibling preview stays
  // visible, making the two scopes unambiguous in the same viewport.
  await page.getByTestId("collapse-section").last().click();

  const panel = page.getByTestId("section-style-panel");
  const card = page.getByTestId("section-card").last();
  const preview = page
    .getByTestId("block-preview")
    .last()
    .getByTestId("public-section");

  await page.getByTestId("section-style-open").last().click();
  await expect(panel).toBeVisible();
  await page.getByTestId("section-style-skin").selectOption("cutout");

  // The choice really did land — otherwise everything below would be
  // measuring an unstyled card and passing for the wrong reason.
  await expect
    .poll(() =>
      preview.evaluate((el) => el.style.getPropertyValue("--skin-clip")),
    )
    .toContain("polygon(");
  expect(await card.evaluate((el) => getComputedStyle(el).clipPath)).toBe(
    "none",
  );

  // The identity section can put the panel below the fold, where
  // `elementFromPoint` answers null. Bring it on screen before using it as
  // corroboration that the outside-scope controls remain operational.
  await panel.scrollIntoViewIfNeeded();
  const box = (await panel.boundingBox())!;
  const centre = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };

  // Hit testing, which `toBeVisible()` does not do. This is corroboration for
  // the negative control after the direct `clip-path: none` assertion above.
  //
  // Asked as "is the panel what is here" rather than "which test id is
  // nearest": the second answer changes the day a field is added to the popup
  // and the centre lands on one, turning a passing test red about the wrong
  // thing.
  const hit = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[data-testid="section-style-panel"]') != null,
    centre,
  );
  expect(hit, "the panel is what is at its own centre").toBe(true);

  // The popup also paints where it hit-tests. Sampled open and closed so a
  // transparent or obscured panel cannot pass only by owning the hit target.
  const probes: Probe[] = [
    { name: "middle", ...centre },
    {
      name: "low",
      x: centre.x,
      y: Math.round(box.y + box.height) - 4,
    },
  ];
  // **Both photographs anchored to the CARD, not to a scroll offset.**
  // `sampleColours` screenshots the viewport, and the panel is in flow — so
  // closing it makes the page shorter, the maximum scroll smaller, and a
  // restored `scrollY` silently clamps to somewhere else. Measured: the open
  // reading sat at 1052 and the closed one clamped to 1028, 24px apart, which
  // is two readings of two different places wearing the same coordinates.
  // The card exists in both states, so each probe is kept as an offset from
  // its top-left corner and rebuilt after the close.
  const anchor = (await card.boundingBox())!;
  const offsets = probes.map((probe) => ({
    name: probe.name,
    dx: probe.x - anchor.x,
    dy: probe.y - anchor.y,
  }));
  const open = await sampleColours(page, probes);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await card.scrollIntoViewIfNeeded();
  const settled = (await card.boundingBox())!;
  const closed = await sampleColours(
    page,
    offsets.map((offset) => ({
      name: offset.name,
      x: Math.round(settled.x + offset.dx),
      y: Math.round(settled.y + offset.dy),
    })),
  );
  for (const probe of probes) {
    expect(
      apart(open[probe.name]!, closed[probe.name]!),
      `the panel paints at ${probe.name}`,
    ).toBeGreaterThan(20);
  }

  // The popup remains ordinary AeleOS chrome outside the cutout scope. Reached
  // by Tab from the skin select so `:focus-visible` genuinely applies, this
  // confirms the negative-control half of the boundary still paints its ring.
  // It is corroboration: the computed `clip-path: none` assertion above is the
  // direct proof that the control card never entered the preview scope.
  await page.getByTestId("section-style-open").last().click();
  await expect(panel).toBeVisible();
  const input = page.getByTestId("section-style-background-url");
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();

  const field = (await input.boundingBox())!;
  const mid = Math.round(field.y + field.height / 2);
  // The ring is drawn three pixels inside the edge and is about two thick, so
  // this band is where it lands and where nothing else changes.
  const ring: Probe[] = [3, 4, 5].map((inset) => ({
    name: `ring-${inset}`,
    x: Math.round(field.x) + inset,
    y: mid,
  }));
  const focused = await sampleColours(page, ring);
  await page.keyboard.press("Tab");
  await expect(input).not.toBeFocused();
  const blurred = await sampleColours(page, ring);
  const moved = Math.max(
    ...ring.map((probe) => apart(focused[probe.name]!, blurred[probe.name]!)),
  );
  expect(
    moved,
    "an AeleOS focus ring remains painted outside the clipped preview",
  ).toBeGreaterThan(20);
});

test("the face paints the skin, and a section's picture at full strength inside its corners", async ({
  page,
}) => {
  await page.route(`**${new URL(PICTURE.url).pathname}`, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PICTURE.body }),
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORT);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill("facecheck");
  await page.getByTestId("editor-display-name").fill("Face check");
  await chooseNewSectionSpaces(page, "2");
  await page.getByTestId("add-section").click();
  await page.getByTestId("add-content").last().click();
  // **Titled, or the leaf renders NOTHING.** `PlainLeaf` returns null with
  // neither a title nor a description, so a freshly added content block draws
  // no card — and the card is what carries the skin's edge.
  await page.getByTestId("leaf-title").last().fill("Painted");
  await page.getByTestId("collapse-section").last().click();

  const tray = page.getByTestId("block-preview").last();
  // **TWO elements, because the section SETS what the card CONSUMES.** The
  // skin's form arrives as custom properties on the section and is drawn by
  // each leaf's own `surface` card; the background picture is painted by the
  // section itself. The deleted face carried both at once, which is why this
  // spec used to need one locator and now needs two. Reading the border off
  // the section answers `0px` however the choice went — measured, it did.
  const section = tray.getByTestId("public-section");
  const face = tray.getByTestId("public-leaf").locator("div").first();

  // **The skin's form, on the layer that paints it.** Delete `surface` from
  // that layer and the border is Preflight's `0`, which no other test in the
  // repository would notice — the card would still be a rounded box of the
  // right colour, and the preview somebody is looking at while they choose
  // would simply stop answering. Pinned against `cutout`'s own `--skin-border`
  // in `skins.ts`, the same discipline the public renderer's tests use.
  await page.getByTestId("section-style-open").last().click();
  await page.getByTestId("section-style-skin").selectOption("cutout");
  await expect
    .poll(() => face.evaluate((el) => getComputedStyle(el).borderTopWidth))
    .toBe("2px");
  await expect
    .poll(() => face.evaluate((el) => getComputedStyle(el).clipPath))
    .toMatch(/^polygon\(/);
  // **There is no face any more, and `face` here names the SECTION.** The tray
  // used to paint an absolute backing beneath the real `Block`, so a viewport
  // probe read the renderer above it rather than the backing — measured, colour
  // distance was 5 whether or not the polygon was there, which is why this
  // reads the computed clip rather than pixels. The tray paints nothing now and
  // renders the real section, so what is asserted below is the element a
  // visitor's browser resolves, and the first test checks the rendered
  // boundary.
  await page.keyboard.press("Escape");
  await face.scrollIntoViewIfNeeded();

  let box = (await face.boundingBox())!;

  // **The picture, at full strength and inside the corners.** Back to the
  // design's own radius first: `cutout` squares the card off, and the corner
  // bleed this guards against is only visible where the face is rounded and
  // the root is not.
  await page.getByTestId("section-style-open").last().click();
  await page.getByTestId("section-style-skin").selectOption("");
  await page.getByTestId("section-style-background-url").fill(PICTURE.url);
  await page.getByTestId("section-style-fit").selectOption("cover");
  await expect
    .poll(() => section.evaluate((el) => getComputedStyle(el).backgroundImage))
    .toContain(PICTURE.url);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("section-style-panel")).toBeHidden();
  await face.scrollIntoViewIfNeeded();

  box = (await section.boundingBox())!;
  // **"AT FULL STRENGTH" WAS A PROPERTY OF THE FACE, AND THE FACE WAS THE BUG.**
  //
  // This used to require the probe within 30 channels of the picture's own
  // colour. That held because the preview tray painted an element of its OWN,
  // carrying the picture above its 90%-alpha surface — so the editor showed the
  // picture at full strength while the public page, which has no such element,
  // showed it through that surface. The assertion was pinning the very
  // difference the face created.
  //
  // Measured after the face went, on bare section background: `[232, 245, 222]`
  // — the picture at about a tenth, behind the surface — which is exactly what
  // a visitor sees, and 232 channels from the flat green the old claim wanted.
  //
  // So the surviving claim is that the section PAINTS it, asserted as a CHANGE
  // against the same probe with no picture set. A literal would be restating
  // whatever the surface's alpha happens to be; the change is the behaviour.
  // `editor-is-the-page.spec.ts` is what holds the editor to the page.
  const spot = {
    name: "bare",
    x: Math.round(box.x + box.width * 0.75),
    y: Math.round(box.y + box.height / 2),
  };
  const withPicture = await sampleColours(page, [spot]);

  await page.getByTestId("section-style-open").last().click();
  await page.getByTestId("section-style-background-url").fill("");
  await expect
    .poll(() => section.evaluate((el) => getComputedStyle(el).backgroundImage))
    .not.toContain(PICTURE.url);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("section-style-panel")).toBeHidden();
  const withoutPicture = await sampleColours(page, [spot]);

  expect(
    apart(withPicture.bare!, withoutPicture.bare!),
    "the section paints the picture a visitor would see",
  ).toBeGreaterThan(10);
  // And it is the picture rather than any change: with it, the probe is nearer
  // the picture's own colour than the bare surface is.
  expect(apart(withPicture.bare!, PICTURE.rgb)).toBeLessThan(
    apart(withoutPicture.bare!, PICTURE.rgb),
  );

  // **THE CORNER-BLEED ASSERTION IS GONE, AND IT IS NOT A LOOSENING.** It
  // asked whether a picture on the ROOT showed in four bright wedges outside a
  // rounded FACE — a question about two elements, one painting behind the
  // other, which is exactly the arrangement the preview tray had and no longer
  // has. There is one element now, the same one a visitor's browser paints, so
  // there is no root for a picture to bleed from. Keeping the assertion would
  // have meant inventing a second element for it to be about.
});

test("AeleOS controls stay readable beside a hostile full-strength tray picture", async ({
  page,
}) => {
  await page.route(`**${new URL(HOSTILE.url).pathname}`, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: HOSTILE.body }),
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORT);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill("readable");
  await page.getByTestId("editor-display-name").fill("Readable");

  // Composed by hand, content and all: a template inserts its sections as data
  // without touching one of these controls, so a template-built page would
  // measure the same pixels while proving nothing about the editor.
  await chooseNewSectionSpaces(page, "1");
  await page.getByTestId("add-section").click();
  await page.getByTestId("add-content").first().click();
  await page.getByTestId("section-name").last().fill("Section");
  await page.getByTestId("leaf-title").first().fill("Item");
  await page.getByTestId("leaf-description").first().fill("A description");

  // **Scoped to the SECTION's own header, not a page-wide `.last()`.** A
  // leaf can open its own style popup now, and the content just added has
  // one — so a bare `.last()` on `section-style-open` would reach past the
  // section's own trigger to the leaf's, styling the wrong element. Only a
  // depth-0 container's header carries `section-header`, so this is
  // unambiguous whatever popups a leaf beneath it grows.
  await page
    .getByTestId("section-header")
    .last()
    .getByTestId("section-style-open")
    .click();
  await page.getByTestId("section-style-background-url").fill(HOSTILE.url);
  await page.getByTestId("section-style-fit").selectOption("cover");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("section-style-panel")).toBeHidden();

  const card = page.getByTestId("section-card").last();
  const face = page
    .getByTestId("block-preview")
    .last()
    .getByTestId("public-section");
  await expect
    .poll(() =>
      card.evaluate((el) => {
        const inline = el.getAttribute("style") ?? "";
        return {
          inline,
          background: getComputedStyle(el).backgroundColor,
        };
      }),
    )
    .toEqual({
      inline: "",
      background: expect.not.stringMatching(/rgba?\([^)]*(?:,\s*0|\/\s*0)\)/),
    });
  // Focus is parked on the paintbrush the popup returned it to. Moved onto the
  // page's own heading so no field under a probe is wearing its focus ring,
  // and no caret is blinking in one while the screenshot is taken.
  await page.getByTestId("editor-handle").click();
  await page.getByTestId("editor-handle").blur();

  /**
   * Every measurement above, in whichever scheme is currently in force.
   *
   * One screenshot serves all of them — `sampleColours` takes its own — so the
   * probes are gathered first and read together, and the text colours come
   * from the browser rather than from a token literal, which is what keeps
   * this measuring the design as it currently is.
   *
   * @param scheme - what to call this scheme when an assertion fails.
   * @returns nothing; asserts.
   */
  const measure = async (scheme: string): Promise<void> => {
    // `sampleColours` photographs the VIEWPORT, so every probe below is only
    // the card's own pixels while the card is on screen — and the identity
    // section above it can push it off. Scrolled first, then measured.
    await card.scrollIntoViewIfNeeded();
    const boxes = await Promise.all(
      READABLE.map(async (spot) =>
        // **Scoped to the styled card.** A page-wide `.first()` reached the
        // identity section's header instead — a card this test never styled,
        // and one the scroll above can push off screen, which is a probe
        // reading whatever happens to be at those coordinates.
        spot.at((await card.getByTestId(spot.area).first().boundingBox())!),
      ),
    );
    const inks = await Promise.all(
      READABLE.map(async (spot) =>
        textColour(card.getByTestId(spot.ink).first()),
      ),
    );
    const probes: Probe[] = [
      ...boxes.map((point, index) => ({ name: String(index), ...point })),
    ];
    const painted = await sampleColours(page, probes);

    for (const [index, spot] of READABLE.entries()) {
      expect(
        contrast(painted[String(index)]!, inks[index]!),
        `${scheme}: ${spot.what} clears ${spot.min}:1`,
      ).toBeGreaterThanOrEqual(spot.min);
    }

    await face.scrollIntoViewIfNeeded();
    const faceBox = (await face.boundingBox())!;
    // **Clear of the heading's GLYPHS.** The section's name sits along the top
    // of its box, so a probe six pixels in from the left lands on antialiased
    // text over the picture and reads a blend — measured, 35 channels off a
    // flat mid-grey, which is a near miss that looks exactly like a real
    // fault. The right-hand end of that same row is bare picture.
    const picture = await sampleColours(page, [
      {
        name: "picture",
        x: Math.round(faceBox.x + faceBox.width) - 10,
        y: Math.round(faceBox.y) + 6,
      },
    ]);
    expect(
      apart(picture.picture!, HOSTILE.rgb),
      `${scheme}: the picture still previews at full strength`,
    ).toBeLessThan(30);
  };

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");
  await measure("light");

  // The dark scheme is not a formality here: `--surface` carries 82% there
  // against light's 90%, so a fifth more of the picture composites through
  // every backing this test is about.
  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await measure("dark");
});

// **The fourth test is about the fit control, and it is here because this is
// the file that photographs this element.** `sectionStyle` used to emit
// `background-repeat` only for `tile` and `background-size` only for `cover`,
// leaving the absent fit — the option a person lands on by default, whose own
// label promises the browser's unscaled, UNREPEATED placement — with neither.
// `background-repeat`'s initial value is `repeat`, so "Default" and "Tile"
// were one behaviour wearing two names, and `background-size` fell through to
// `@utility surface`'s own `var(--skin-gloss-size)` — which under `comic` is a
// 6px texture tile, so a picture the public page renders at natural size
// previewed as a mosaic of itself.
//
// Both properties are emitted for every fit now, and this measures the three
// options as three paints rather than as three stored values. The picture is
// 8x8, so an unrepeated copy occupies one corner of a card hundreds of pixels
// wide and a probe well away from that corner is the whole measurement.
test("the three background fits are three different paints", async ({
  page,
}) => {
  await page.route(`**${new URL(PICTURE.url).pathname}`, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PICTURE.body }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORT);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  await chooseNewSectionSpaces(page, "2");
  await page.getByTestId("add-section").click();
  await page.getByTestId("add-content").last().click();
  // **Titled, or the leaf renders NOTHING.** `PlainLeaf` returns null with
  // neither a title nor a description, so a freshly added content block draws
  // no card — and the card is what carries the skin's edge.
  await page.getByTestId("leaf-title").last().fill("Painted");
  await page.getByTestId("collapse-section").last().click();

  const tray = page.getByTestId("block-preview").last();
  // **TWO elements, because the section SETS what the card CONSUMES.** The
  // skin's form arrives as custom properties on the section and is drawn by
  // each leaf's own `surface` card; the background picture is painted by the
  // section itself. The deleted face carried both at once, which is why this
  // spec used to need one locator and now needs two. Reading the border off
  // the section answers `0px` however the choice went — measured, it did.
  // **The SECTION, because the subject here is the picture.** A background
  // picture is painted by the section; a skin's edge is drawn by each leaf's
  // own card. The deleted face carried both, which is why this spec's two
  // tests now name different elements — and reading the picture off the card
  // finds no inline style at all, which is how this one failed.
  const face = tray.getByTestId("public-section");

  await page.getByTestId("section-style-open").last().click();
  await page.getByTestId("section-style-background-url").fill(PICTURE.url);
  await expect
    .poll(() => face.evaluate((el) => getComputedStyle(el).backgroundImage))
    .toContain(PICTURE.url);

  /**
   * What the face paints at two points: one the picture's single copy covers,
   * and one only a repeat or a scale can reach.
   *
   * The card is collapsed, 88px tall, and the header row's own backing begins
   * around ten pixels down — so both probes sit in the strip above it, which
   * is the face and nothing else. `origin` is five pixels in, inside the 8x8
   * copy's own footprint; `away` is forty pixels in, five times further than
   * one copy can reach. Measured rather than assumed: a probe grid across this
   * card showed the copy ending between x=8 and x=12 and the backing beginning
   * between y=10 and y=20.
   *
   * Taken with the panel closed, because the panel is a descendant of the card
   * and would be the thing photographed instead.
   *
   * @returns the two sampled colours.
   */
  const paints = async (): Promise<{ origin: number[]; away: number[] }> => {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("section-style-panel")).toBeHidden();
    const box = (await face.boundingBox())!;
    const sampled = await sampleColours(page, [
      { name: "origin", x: Math.round(box.x) + 5, y: Math.round(box.y) + 5 },
      { name: "away", x: Math.round(box.x) + 40, y: Math.round(box.y) + 6 },
    ]);
    await page.getByTestId("section-style-open").last().click();
    return { origin: sampled.origin!, away: sampled.away! };
  };

  /**
   * Picks a fit and waits for the choice to reach the DOM.
   *
   * It polls the face's own inline `style` attribute for ANY change rather
   * than for the `background-repeat` this fix introduced. That is deliberate:
   * a poll on the corrected value would time out first under exactly the fault
   * the pixels below exist to catch, and the pixel assertions would never have
   * been seen red. Every fit change rewrites that attribute under the broken
   * implementation too, so it is a barrier and not a second assertion.
   *
   * @param value - the option to select.
   * @returns nothing; waits.
   */
  const fit = async (value: string): Promise<void> => {
    const before = await face.getAttribute("style");
    await page.getByTestId("section-style-fit").selectOption(value);
    await expect.poll(() => face.getAttribute("style")).not.toBe(before);
  };

  const resolved = (): Promise<string[]> =>
    face.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundRepeat, style.backgroundSize];
    });

  // No `fit("")` first: filling the address above already left the section on
  // the default fit, so selecting it would be a change that changes nothing
  // and the barrier above would have nothing to wait for.
  const unsetResolved = await resolved();
  const unset = await paints();
  await fit("tile");
  const tiledResolved = await resolved();
  const tiled = await paints();
  await fit("cover");
  const coveredResolved = await resolved();
  const covered = await paints();

  // Every fit paints the picture where the picture is. Without this the
  // assertion below would also pass on a default fit that painted NOTHING,
  // which is a different bug wearing the same number.
  for (const [name, sample] of [
    ["default", unset],
    ["tile", tiled],
    ["cover", covered],
  ] as const) {
    expect(
      apart(sample.origin, PICTURE.rgb),
      `${name} paints the picture at the picture's own origin`,
    ).toBeLessThan(30);
  }

  // Tile and cover both reach forty pixels in; the default must not. **That
  // is the assertion the old behaviour failed** — with `background-repeat`
  // left at its initial `repeat`, `unset` and `tiled` were the same green
  // here, and the fit control had two names for one paint.
  expect(
    apart(tiled.away, PICTURE.rgb),
    "tile reaches a point one copy cannot",
  ).toBeLessThan(30);
  expect(
    apart(covered.away, PICTURE.rgb),
    "cover reaches a point one copy cannot",
  ).toBeLessThan(30);
  expect(
    apart(unset.away, PICTURE.rgb),
    "the default fit paints one unrepeated copy, not a field of them",
  ).toBeGreaterThan(60);

  // The resolved values last, as corroboration rather than as the proof, and
  // for the same reason the barrier above avoids them. `background-size` is
  // the half that closes the skin-gloss leak: without it the face falls
  // through to `@utility surface`'s `var(--skin-gloss-size)`, which is `auto`
  // under the default skin and `6px 6px` under `comic`.
  expect(unsetResolved).toEqual(["no-repeat", "auto"]);
  expect(tiledResolved).toEqual(["repeat", "auto"]);
  expect(coveredResolved).toEqual(["no-repeat", "cover"]);
});

// **THE FACE MUST NOT PAINT OVER THE SECTION'S OWN WRITING.** Everything above
// measures what the face paints; nothing measured whether anything survived
// underneath it, and for two days nothing did. The face is `absolute` with
// `z-index: auto` while the section content is `static`, and positioned
// descendants paint AFTER in-flow content — so its `--surface`, at 90% alpha,
// veiled every tray in the editor from the day it shipped in `6636b4c`.
//
// Measured on the unfixed code: hiding the face changed 79.56% of a tray's
// pixels, and the section heading painted `[238, 228, 224]` where the page
// paints `[57, 30, 23]` — 201 channels, on the words somebody is reading.
// Where the author had a background picture the text vanished outright, since
// that picture is on the face too and paints at full strength.
//
// Rule 27: this is asserted on RENDERED pixels because the veiled and unveiled
// cases are byte-identical in every computed value. See `darkestPixel`.
test("the face does not paint over the section's own writing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORT);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  // The dev overlay's badge is the darkest thing on this page and lands
  // inside the box being photographed, where it — not the writing — would be
  // the darkest pixel in BOTH the veiled and unveiled cases. Measured: it made
  // the two indistinguishable at [23, 23, 23]. Same idiom as `responsive` and
  // `preview-fidelity`.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.getByTestId("editor-handle").fill("veilcheck");
  await page.getByTestId("editor-display-name").fill("Veil check");
  await chooseNewSectionSpaces(page, "1");
  await page.getByTestId("add-section").click();
  await page.getByTestId("section-name").last().fill("Legible heading");
  await page.getByTestId("add-content").last().click();
  await page.getByTestId("leaf-title").last().fill("Legible body");
  await page.getByTestId("collapse-section").last().click();

  const heading = page
    .getByTestId("block-preview")
    .last()
    .getByTestId("public-section")
    .locator("h2")
    .first();
  await expect(heading).toBeVisible();

  // What the section says its ink is, and what reached the glass.
  const ink = await textColour(heading);
  const painted = await darkestPixel(page, heading);
  expect(
    apart(painted, ink),
    `the heading's ink reaches the screen: painted ${JSON.stringify(painted)} ` +
      `against a declared ${JSON.stringify(ink)}`,
  ).toBeLessThan(30);

  // And the same claim one level in, because a leaf's writing sits deeper in
  // the tree than the section name and could be occluded by a layer the
  // heading escapes.
  const leaf = page
    .getByTestId("block-preview")
    .last()
    .getByTestId("public-section")
    .getByTestId("public-leaf")
    .first();
  await expect(leaf).toBeVisible();
  expect(
    apart(await darkestPixel(page, leaf), await textColour(leaf)),
    "a leaf's own writing reaches the screen too",
  ).toBeLessThan(30);
});
