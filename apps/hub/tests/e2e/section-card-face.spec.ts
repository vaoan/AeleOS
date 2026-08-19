import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import {
  apart,
  contrast,
  sampleColours,
  textColour,
  type Probe,
} from "./support/pixels";

// WHY THIS FILE EXISTS.
//
// `cutout` is the first skin to set `clip-path`, and `clip-path` clips an
// element's whole SUBTREE — positioned descendants included, at any `z-index`,
// because the clip also makes its element a stacking context. `SectionStyle
// Popup`'s panel is a descendant of the card it styles. So while the card
// itself carried `surface`, choosing `cutout` in that popup cut the popup
// away: worst on a COLLAPSED card, which is about one control row tall, where
// what got cut included the skin select that would put the choice back. A
// control that can disable its own undo.
//
// **Nothing on the branch could have caught it.** jsdom implements no
// `clip-path`, so `section-style-popup.test.tsx` is blind to it by
// construction, and `skin-mechanisms.spec.ts` only ever visits the public
// page, where no overlay exists. That is the drag-handle bug's exact shape —
// the one suite covering the control mocked away the thing that broke it — and
// it is why this file drives the real popup in a real browser rather than
// asserting anything about what the code emits.
//
// The second half is the same fact applied to `outline`, which the first pass
// reasoned about for `box-shadow` and not for it. A focus ring is painted just
// OUTSIDE the border box and `polygon()` resolves against that box, so under
// `cutout` a keyboard visitor lost the indicator on every surface at once
// (WCAG 2.4.7). `@utility surface` draws its ring inside now, and this
// measures that a ring appears at all.
//
// **The second test is about what the face PAINTS**, and it exists because the
// refactor that fixed the clip moved the paint without measuring it. Delete
// `surface` from the layer and the editor's preview loses its border, its
// gloss and its chamfer while every other test in the repository stays green —
// the "control that does nothing" fault, in the file whose comments invoke it
// three times. And a section's own background picture has to READ in the
// editor about as it reads on the public page, where the wrapper carries no
// surface at all and the picture is at full strength; a picture behind a
// 90%-alpha face is a preview showing a tenth of what it previews, and a
// picture on the ROOT bleeds past the face's corners.
//
// **The third test is the other half of that same fix, and it exists because
// the second one shipped without it.** A face showing the picture at full
// strength is a face the editor's own controls sit straight on top of, and
// every one of them was `background-color: rgba(0, 0, 0, 0)` — so the change
// that made the preview honest made the labels and inputs above it
// unreadable, and nothing in the repository could tell: this file measured
// the picture's strength and its corners, and a completely illegible editor
// passed every assertion in it. The answer is not to dim the face again —
// that is the trade the second test refuses — it is what the PUBLIC page
// already does with the same picture, which is to float its content on cards
// painting `bg-(--surface)`. Both halves are therefore asserted in ONE test,
// against one deliberately hostile picture: the controls clear 4.5:1 and the
// picture is still unmodified where nothing covers it. Split across two and
// either could be restored at the other's expense, which is exactly how this
// got here.
//
// **The fourth test is about the fit control**, and it belongs here because
// this is the file that photographs this element. Its own comment carries the
// account; the short version is that two of the three options painted the
// same picture and the third read the SKIN's texture tile.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

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
    ink: "drag-0",
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

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("cutout does not cut away the popup that sets it, and a focus ring survives it", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));

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
  await page.getByTestId("new-section-spaces").selectOption("2");
  await page.getByTestId("add-section").click();

  // **Collapsed, which is the total case.** Only the card's BODY is gated on
  // collapse; the header row and its paintbrush render regardless. A collapsed
  // card is roughly one control row tall, so a panel anchored under that row
  // sits almost entirely outside the card's border box — everything a clip on
  // the card would take.
  await page.getByTestId("collapse-section").first().click();

  const panel = page.getByTestId("section-style-panel");
  const card = page.getByTestId("section-card").first();

  await page.getByTestId("section-style-open").click();
  await expect(panel).toBeVisible();
  await page.getByTestId("section-style-skin").selectOption("cutout");

  // The choice really did land — otherwise everything below would be
  // measuring an unstyled card and passing for the wrong reason.
  await expect
    .poll(() => card.evaluate((el) => el.style.getPropertyValue("--skin-clip")))
    .toContain("polygon(");

  const box = (await panel.boundingBox())!;
  const centre = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };

  // **Hit testing, which `toBeVisible()` does not do.** Playwright's
  // visibility is bounding box and `display`; a clipped element passes it
  // while being neither painted nor clickable. `clip-path` does reach hit
  // testing, so this is the cheap half of the proof.
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

  // The other half, and the one a stacking-context bug could still fail: is it
  // PAINTED there? Sampled with the panel open and again with it closed, at
  // points inside its lower half — the part a clipped card removes first. A
  // panel that never painted leaves both readings identical.
  const probes: Probe[] = [
    { name: "middle", ...centre },
    {
      name: "low",
      x: centre.x,
      y: Math.round(box.y + box.height) - 4,
    },
  ];
  const open = await sampleColours(page, probes);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  const closed = await sampleColours(page, probes);
  for (const probe of probes) {
    expect(
      apart(open[probe.name]!, closed[probe.name]!),
      `the panel paints at ${probe.name}`,
    ).toBeGreaterThan(20);
  }

  // **A focus ring on a clipped surface.** The background-address input is a
  // `surface` inside the same `cutout` scope, so it carries the chamfer
  // itself; reached by Tab from the skin select, which the popup focuses on
  // open, so the focus is keyboard-derived and `:focus-visible` genuinely
  // applies. Measured against the same points with the focus moved on, rather
  // than against a neighbour, so nothing depends on what the input is painted
  // over.
  await page.getByTestId("section-style-open").click();
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
    "a focus ring is painted inside a clipped surface",
  ).toBeGreaterThan(20);
});

test("the face paints the skin, and a section's picture at full strength inside its corners", async ({
  page,
}) => {
  await page.route(`**${new URL(PICTURE.url).pathname}`, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PICTURE.body }),
  );
  await signIn(page, await mintTicket(identity!.userId));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORT);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill("facecheck");
  await page.getByTestId("editor-display-name").fill("Face check");
  await page.getByTestId("new-section-spaces").selectOption("2");
  await page.getByTestId("add-section").click();
  await page.getByTestId("collapse-section").first().click();

  const card = page.getByTestId("section-card").first();
  const face = page.getByTestId("section-card-face").first();

  // **The skin's form, on the layer that paints it.** Delete `surface` from
  // that layer and the border is Preflight's `0`, which no other test in the
  // repository would notice — the card would still be a rounded box of the
  // right colour, and the preview somebody is looking at while they choose
  // would simply stop answering. Pinned against `cutout`'s own `--skin-border`
  // in `skins.ts`, the same discipline the public renderer's tests use.
  await page.getByTestId("section-style-open").click();
  await page.getByTestId("section-style-skin").selectOption("cutout");
  await expect
    .poll(() => face.evaluate((el) => getComputedStyle(el).borderTopWidth))
    .toBe("2px");
  await expect
    .poll(() => face.evaluate((el) => getComputedStyle(el).clipPath))
    .toMatch(/^polygon\(/);
  await page.keyboard.press("Escape");

  // The chamfer, in pixels rather than in a resolved value: the card's corner
  // is cut away and a point along the same edge is not. Under `cutout`
  // `--skin-round` is `0`, so nothing but the clip can account for the
  // difference — which is what makes this the guard for the layer painting at
  // all, and not merely for `clip-path` resolving on it.
  let box = (await card.boundingBox())!;
  const cut: Probe[] = [
    { name: "corner", x: Math.round(box.x) + 4, y: Math.round(box.y) + 4 },
    { name: "edge", x: Math.round(box.x) + 30, y: Math.round(box.y) + 4 },
  ];
  const chamfered = await sampleColours(page, cut);
  expect(
    apart(chamfered.corner!, chamfered.edge!),
    "the face's chamfered corner is cut away",
  ).toBeGreaterThan(20);

  // **The picture, at full strength and inside the corners.** Back to the
  // design's own radius first: `cutout` squares the card off, and the corner
  // bleed this guards against is only visible where the face is rounded and
  // the root is not.
  await page.getByTestId("section-style-open").click();
  await page.getByTestId("section-style-skin").selectOption("");
  await page.getByTestId("section-style-background-url").fill(PICTURE.url);
  await page.getByTestId("section-style-fit").selectOption("cover");
  await expect
    .poll(() => face.evaluate((el) => getComputedStyle(el).backgroundImage))
    .toContain(PICTURE.url);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("section-style-panel")).toBeHidden();

  box = (await card.boundingBox())!;
  const left = Math.round(box.x);
  const top = Math.round(box.y);
  // `rounded-xl` at the design's own `--skin-round` is 12px, so (6,6) is
  // inside that corner's arc and (2,2) is outside it — the arithmetic the
  // sister spec's corner probe rests on, used here for both answers at once.
  const picture = await sampleColours(page, [
    { name: "inside", x: left + 6, y: top + 6 },
    { name: "outside", x: left + 2, y: top + 2 },
  ]);

  // Full strength: the face paints the picture ABOVE its own 90%-alpha
  // colour, on one element, so what a probe reads is the picture. Behind that
  // colour instead it would read within a few units of the page's own near
  // white, which is the regression this exists to catch.
  expect(
    apart(picture.inside!, PICTURE.rgb),
    "the picture previews at full strength",
  ).toBeLessThan(30);

  // And clipped by the face's corners: on the ROOT the picture is a square
  // rect behind a rounded face, and shows in four bright wedges outside it.
  expect(
    apart(picture.outside!, PICTURE.rgb),
    "the picture does not bleed past the card's corner",
  ).toBeGreaterThan(60);
});

test("the editor's controls stay readable over a hostile picture, and the picture stays at full strength", async ({
  page,
}) => {
  await page.route(`**${new URL(HOSTILE.url).pathname}`, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: HOSTILE.body }),
  );
  await signIn(page, await mintTicket(identity!.userId));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORT);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  await page.getByTestId("editor-handle").fill("readable");
  await page.getByTestId("editor-display-name").fill("Readable");

  // Composed by hand, content and all: a template inserts its sections as data
  // without touching one of these controls, so a template-built page would
  // measure the same pixels while proving nothing about the editor.
  await page.getByTestId("new-section-spaces").selectOption("1");
  await page.getByTestId("add-section").click();
  await page.getByTestId("add-content").first().click();
  await page.getByTestId("section-name").first().fill("Section");
  await page.getByTestId("leaf-title").first().fill("Item");
  await page.getByTestId("leaf-description").first().fill("A description");

  await page.getByTestId("section-style-open").click();
  await page.getByTestId("section-style-background-url").fill(HOSTILE.url);
  await page.getByTestId("section-style-fit").selectOption("cover");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("section-style-panel")).toBeHidden();

  const card = page.getByTestId("section-card").first();
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
    const boxes = await Promise.all(
      READABLE.map(async (spot) =>
        spot.at((await page.getByTestId(spot.area).first().boundingBox())!),
      ),
    );
    const inks = await Promise.all(
      READABLE.map(async (spot) =>
        textColour(page.getByTestId(spot.ink).first()),
      ),
    );
    const cardBox = (await card.boundingBox())!;
    const probes: Probe[] = [
      ...boxes.map((point, index) => ({ name: String(index), ...point })),
      // The other half of the trade, in the same photograph as the halves it
      // could be traded against: six pixels into the card is inside the
      // face's 12px corner arc and outside the header row's backing, which
      // begins at the card's own padding less one. A wash restored over the
      // whole card to win the ratios above fails here.
      {
        name: "picture",
        x: Math.round(cardBox.x) + 6,
        y: Math.round(cardBox.y) + 6,
      },
    ];
    const painted = await sampleColours(page, probes);

    for (const [index, spot] of READABLE.entries()) {
      expect(
        contrast(painted[String(index)]!, inks[index]!),
        `${scheme}: ${spot.what} clears ${spot.min}:1`,
      ).toBeGreaterThanOrEqual(spot.min);
    }

    expect(
      apart(painted.picture!, HOSTILE.rgb),
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
  await signIn(page, await mintTicket(identity!.userId));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(VIEWPORT);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.goto("/es/pages/new");
  await page.getByTestId("new-section-spaces").selectOption("2");
  await page.getByTestId("add-section").click();
  await page.getByTestId("collapse-section").first().click();

  const card = page.getByTestId("section-card").first();
  const face = page.getByTestId("section-card-face").first();

  await page.getByTestId("section-style-open").click();
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
    const box = (await card.boundingBox())!;
    const sampled = await sampleColours(page, [
      { name: "origin", x: Math.round(box.x) + 5, y: Math.round(box.y) + 5 },
      { name: "away", x: Math.round(box.x) + 40, y: Math.round(box.y) + 6 },
    ]);
    await page.getByTestId("section-style-open").click();
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
