import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { apart, contrast, sampleColours, textColour } from "./support/pixels";

// WHY THIS FILE EXISTS.
//
// #8 correctly stopped an author's control tokens at preview hosts, but also
// stopped the field, background picture and canvas tokens there. The actual
// canvas lives in the root layout and reads documentElement, so every moving
// backdrop control became a control that changed nothing. Unit tests can prove
// the stylesheet's words and cannot prove that the root canvas consumed them.
//
// This drives the real editor and checks all three boundaries: the atmosphere
// reaches the document, AeleOS control tokens do not, and bare workbench text
// remains on an opaque stable backing over hostile author paint.
//
// **The panel is no longer what puts the atmosphere there, and this file was
// rewritten around that on 2026-08-27.** `atmosphereCss` mounted a filtered
// subset of the theme while a page-scale surface was open; the editor themes
// its whole document with the draft now, through the same `ThemeScope` a public
// route uses, so the atmosphere is the author's whether the panel is open or
// shut. What the panel changes is the VALUES. What must not change is any
// control, and the readings taken before it was ever opened are the ones the
// closing assertions compare against.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");
test.setTimeout(60_000);

const VIEWPORT = { width: 1440, height: 1400 };
const PICTURE = {
  url: "https://example.com/editor-atmosphere.svg",
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#00c800"/></svg>',
  rgb: [0, 200, 0],
};

const CONTROL_TOKENS = [
  "--surface-solid",
  "--bar-solid",
  "--menu",
  "--ink",
  "--ink-2",
  "--muted",
  "--edge",
  "--accent",
  "--on-accent",
  "--skin-round",
] as const;

/**
 * Reads both inherited control tokens and the paint they drive.
 *
 * A token-only comparison could pass while a literal author colour restyled
 * the element; a paint-only comparison could pass while a leaked token went
 * unused today. Both are read so the boundary remains meaningful as controls
 * evolve.
 *
 * @param target - AeleOS chrome outside every preview host.
 * @returns stable token and computed-paint values.
 */
async function controlStyle(target: Locator): Promise<Record<string, string>> {
  return target.evaluate((element, tokens) => {
    const style = getComputedStyle(element);
    return {
      ...Object.fromEntries(
        tokens.map((token) => [token, style.getPropertyValue(token)]),
      ),
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderColor: style.borderTopColor,
      borderRadius: style.borderTopLeftRadius,
      cursor: style.cursor,
    };
  }, CONTROL_TOKENS);
}

/**
 * Reads the atmosphere values consumed by body and the root canvas.
 *
 * @param page - the live editor page.
 * @returns resolved root properties and body background layers.
 */
async function atmosphereStyle(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      field: root.getPropertyValue("--field"),
      canvas: root.getPropertyValue("--canvas"),
      canvasOne: root.getPropertyValue("--canvas-1"),
      density: root.getPropertyValue("--canvas-density"),
      speed: root.getPropertyValue("--canvas-speed"),
      scale: root.getPropertyValue("--canvas-scale"),
      blend: root.getPropertyValue("--nebula-blend"),
      image: body.backgroundImage,
      repeat: body.backgroundRepeat,
      size: body.backgroundSize,
    };
  });
}

/**
 * Captures the root canvas bitmap after it has a real drawing buffer.
 *
 * Reduced motion holds that bitmap still until an atmosphere mutation asks
 * the canvas to redraw, so a changed data URL is a changed render rather than
 * elapsed animation time.
 *
 * @param page - the live editor page.
 * @returns the canvas bitmap as a data URL.
 */
async function canvasBitmap(page: Page): Promise<string> {
  const canvas = page.locator("canvas[aria-hidden=true]");
  await expect
    .poll(() => canvas.evaluate((node) => (node as HTMLCanvasElement).width))
    .toBeGreaterThan(0);
  return canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL());
}

/**
 * Reads a bitmap after pending style mutations and canvas redraws have run.
 *
 * A comparison whose baseline is captured while the preceding control's
 * MutationObserver is still queued lets that preceding redraw carry the next
 * assertion. Two browser frames put the baseline after React's style commit,
 * the observer microtask and the redraw it requests.
 *
 * @param page - the live editor page.
 * @returns the settled canvas bitmap as a data URL.
 */
async function settledCanvasBitmap(page: Page): Promise<string> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return canvasBitmap(page);
}

interface TemporalCanvasDelta {
  /** Mean sampled RGB-channel change per elapsed millisecond. */
  rate: number;
  /** Browser-reported time between the sampled frames. */
  elapsed: number;
  /** Mean sampled RGB-channel change before time normalisation. */
  difference: number;
}

/**
 * Measures how quickly an animated canvas's pixels change over real frames.
 *
 * Both captures run inside `requestAnimationFrame` callbacks registered after
 * the canvas loop, so each reads the frame that loop just painted. The metric
 * samples the moving lower half of the `grid` canvas and divides mean RGB
 * change by the browser's own elapsed timestamp; a slower machine therefore
 * gets a longer interval rather than an artificially larger animation rate.
 *
 * @param page - the live editor page with motion allowed.
 * @param frames - browser frames separating the two samples.
 * @returns temporal pixel difference and its measured interval.
 */
async function temporalCanvasDelta(
  page: Page,
  frames: number,
): Promise<TemporalCanvasDelta> {
  return page
    .locator("canvas[aria-hidden=true]")
    .evaluate(async (node, frameCount) => {
      const canvas = node as HTMLCanvasElement;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("root canvas has no 2D context");

      const capture = () =>
        new Promise<{ at: number; pixels: Uint8ClampedArray }>((resolve) => {
          requestAnimationFrame((at) => {
            resolve({
              at,
              pixels: context.getImageData(0, 0, canvas.width, canvas.height)
                .data,
            });
          });
        });

      const first = await capture();
      let last = first;
      for (let frame = 0; frame < frameCount; frame += 1) {
        last = await capture();
      }

      let total = 0;
      let channels = 0;
      const firstRow = Math.floor(canvas.height * 0.45);
      for (let y = firstRow; y < canvas.height; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const offset = (y * canvas.width + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            total += Math.abs(
              last.pixels[offset + channel]! - first.pixels[offset + channel]!,
            );
            channels += 1;
          }
        }
      }
      const elapsed = last.at - first.at;
      const difference = total / channels;
      return { rate: difference / elapsed, elapsed, difference };
    }, frames);
}

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("the document wears the draft's atmosphere without restyling editor chrome", async ({
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

  const toolbar = page.getByTestId("editor-save");
  const input = page.getByTestId("editor-display-name");
  const card = page.getByTestId("section-card").first();
  const controlsBefore = await Promise.all([
    controlStyle(toolbar),
    controlStyle(input),
    controlStyle(card),
  ]);
  const atmosphereBefore = await atmosphereStyle(page);
  let canvasBefore = await canvasBitmap(page);

  await page.getByTestId("theme-open").click();
  await page.getByTestId("gradient-stop-0").click();
  await page.getByTestId("gradient-colour").fill("#050505");
  await page.getByTestId("gradient-stop-1").click();
  await page.getByTestId("gradient-colour").fill("#050505");
  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({ field: expect.stringContaining("#050505") });
  // The gradient edit makes the whole theme explicit, including seeded canvas
  // colours. Establish the bitmap AFTER that redraw so it cannot carry the
  // picker assertion that follows.
  canvasBefore = await settledCanvasBitmap(page);

  await page.getByTestId("theme-canvas").selectOption("stars");
  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({ canvas: "stars" });
  await expect
    .poll(() => canvasBitmap(page), {
      message: "the canvas picker redraws the root canvas",
    })
    .not.toBe(canvasBefore);
  canvasBefore = await settledCanvasBitmap(page);

  await page.getByTestId("theme-canvas-colour-0").fill("#00ff88");
  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({ canvasOne: "0 255 136" });
  await expect
    .poll(() => canvasBitmap(page), {
      message: "the canvas colour picker redraws the root canvas",
    })
    .not.toBe(canvasBefore);
  canvasBefore = await settledCanvasBitmap(page);

  await page.getByTestId("theme-density").fill("2.5");
  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({ density: "2.5" });
  await expect
    .poll(() => canvasBitmap(page), {
      message: "the density dial redraws the root canvas",
    })
    .not.toBe(canvasBefore);
  canvasBefore = await settledCanvasBitmap(page);

  await page.getByTestId("theme-scale").fill("1.75");
  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({ scale: "1.75" });
  await expect
    .poll(() => canvasBitmap(page), {
      message: "the scale dial redraws the root canvas",
    })
    .not.toBe(canvasBefore);

  // This reduced-motion path CANNOT prove speed in pixels: every still renderer
  // draws at time zero and `frameSignature` deliberately excludes that dial.
  // Pin its root wiring here; the separate animated test below supplies the
  // rendered temporal proof.
  await page.getByTestId("theme-speed").fill("0.5");
  await expect
    .poll(() => atmosphereStyle(page), {
      message: "the speed dial reaches the document root",
    })
    .toMatchObject({ speed: "0.5" });

  await page.getByTestId("theme-background-url").fill(PICTURE.url);
  await page.getByTestId("theme-background-fit").selectOption("tile");

  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({
      canvas: "stars",
      canvasOne: "0 255 136",
      density: "2.5",
      speed: "0.5",
      scale: "1.75",
      image: expect.stringContaining(PICTURE.url),
      repeat: "repeat, no-repeat",
      size: "auto, cover",
    });
  const atmosphereOpen = await atmosphereStyle(page);
  expect(atmosphereOpen.field).not.toBe(atmosphereBefore.field);
  expect(atmosphereOpen.blend).not.toBe("");

  const contentBox = await page.getByTestId("editor-content").boundingBox();
  expect(contentBox).not.toBeNull();
  const outside = {
    name: "outside",
    x: Math.max(2, Math.round(contentBox!.x / 2)),
    // Viewport coordinates, unlike the document-height box: the controls above
    // have scrolled the form, so a point derived from its current y can be
    // negative and `getImageData` would honestly answer transparent black.
    y: Math.round(VIEWPORT.height / 2),
  };
  const openPaint = await sampleColours(page, [outside]);
  expect(
    apart(openPaint.outside!, PICTURE.rgb),
    "the body paints the author's picture while the panel is open",
  ).toBeLessThan(30);

  expect(await controlStyle(toolbar)).toEqual(controlsBefore[0]);
  expect(await controlStyle(input)).toEqual(controlsBefore[1]);
  expect(await controlStyle(card)).toEqual(controlsBefore[2]);

  /**
   * Measures a bare identity label over the content column's own backing.
   *
   * The probe is at the far right of the label row, away from its glyphs, and
   * therefore reads the backing the label actually sits on. The author's field
   * is independently asserted on documentElement before each measurement, so a
   * missing atmosphere cannot make this pass by leaving the app background in
   * place.
   *
   * @param scheme - which app scheme supplies the stable chrome tokens.
   * @param hostile - the author's opposite-lightness field.
   * @returns the measured WCAG contrast ratio.
   */
  const editorContrast = async (
    scheme: "light" | "dark",
    hostile: string,
  ): Promise<number> => {
    for (const stop of [0, 1]) {
      await page.getByTestId(`gradient-stop-${stop}`).click();
      await page.getByTestId("gradient-colour").fill(hostile);
    }
    await expect
      .poll(() => atmosphereStyle(page))
      .toMatchObject({ field: expect.stringContaining(hostile) });

    const content = page.getByTestId("editor-identity-fields");
    const label = content.locator('label[for="displayName"]');
    await label.scrollIntoViewIfNeeded();
    const [labelBox, contentBox] = await Promise.all([
      label.boundingBox(),
      content.boundingBox(),
    ]);
    const painted = await sampleColours(page, [
      {
        name: scheme,
        x: Math.round(contentBox!.x + contentBox!.width) - 12,
        y: Math.round(labelBox!.y + labelBox!.height / 2),
      },
    ]);
    return contrast(painted[scheme]!, await textColour(label));
  };

  const lightContrast = await editorContrast("light", "#050505");
  expect(
    lightContrast,
    "light chrome over a near-black field",
  ).toBeGreaterThanOrEqual(4.5);

  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkContrast = await editorContrast("dark", "#fafafa");
  expect(
    darkContrast,
    "dark chrome over a near-white field",
  ).toBeGreaterThanOrEqual(4.5);

  // Return to the original scheme before the closing assertions; otherwise the
  // app's own light/dark tokens would differ for a reason unrelated to the
  // panel.
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // **What the document is wearing with the panel still OPEN**, so the
  // assertions after it close are about the closing rather than about which
  // colour happened to be set last. The contrast measurements above leave the
  // author's field on whatever they ended with, and naming that value here
  // would be restating the fixture rather than checking anything.
  const beforeClosing = await atmosphereStyle(page);

  await page.getByTestId("theme-open").click();

  // **CLOSING THE PANEL NO LONGER TAKES THE ATMOSPHERE WITH IT, AND THAT IS
  // THE CHANGE RATHER THAN A REGRESSION.**
  //
  // This used to assert the opposite: that the field went back to the app's
  // and the author's picture stopped painting. That was right while
  // `atmosphereCss` mounted a filtered subset of the theme only while a
  // page-scale surface was open. The editor themes its whole document with the
  // draft now, through the same `ThemeScope` a public route uses, so the
  // atmosphere is the author's whether this panel is open or shut — which is
  // the entire point, since a canvas fixed to the viewport cannot be judged
  // inside a box.
  //
  // What still has to hold, and is what this test is really for, is that the
  // CONTROLS did not move. Each is an island wearing `CHROME_SCOPE`, and these
  // three readings are the same ones taken before the panel was ever opened.
  await expect.poll(() => atmosphereStyle(page)).toEqual(beforeClosing);
  expect(await controlStyle(toolbar)).toEqual(controlsBefore[0]);
  expect(await controlStyle(input)).toEqual(controlsBefore[1]);
  expect(await controlStyle(card)).toEqual(controlsBefore[2]);

  const closedPaint = await sampleColours(page, [outside]);
  expect(
    apart(closedPaint.outside!, PICTURE.rgb),
    "the author's picture keeps painting once the panel is closed",
  ).toBeLessThan(30);
});

test("the speed dial changes the animated canvas rate", async ({ page }) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/es/pages/new");
  await page.getByTestId("theme-open").click();
  await page.getByTestId("theme-canvas").selectOption("grid");
  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({ canvas: "grid" });

  await page.getByTestId("theme-speed").fill("0.25");
  await expect
    .poll(() => atmosphereStyle(page))
    .toMatchObject({ speed: "0.25" });
  await settledCanvasBitmap(page);
  const slow = await temporalCanvasDelta(page, 10);

  await page.getByTestId("theme-speed").fill("5");
  await expect.poll(() => atmosphereStyle(page)).toMatchObject({ speed: "5" });
  await settledCanvasBitmap(page);
  const fast = await temporalCanvasDelta(page, 10);

  expect(
    fast.rate,
    `5× speed changes pixels faster than 0.25×: ${JSON.stringify({
      slow,
      fast,
    })}`,
  ).toBeGreaterThan(slow.rate * 2);
});

// WHAT USED TO BE HERE.
//
// A note explaining that the complete preview was, for one day, a second
// caller of `atmosphereCss`, and then stopped being one when it became a framed
// route. Both the preview and `atmosphereCss` are gone — see
// `2026-08-27-the-editor-wears-the-page-design.md` — so the note described a
// mechanism nobody can run. `git log` has it.
