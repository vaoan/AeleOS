import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// WHAT THIS FILE IS FOR, AND THE SHORTCUT IT EXISTS TO FORBID.
//
// The editor was cut down its right-hand edge on every phone. At 360px the form
// asked for 486px and the last 126 of it — the end of every field, and the
// buttons beside them — were off-screen behind a sideways scroll most people
// never think to try. At 320px every page did it, not only the editor.
//
// Two causes, and which was which was settled by taking each fix away again
// rather than by reading the markup. A `select` is as wide as its longest
// option, so the section row — handle, name, a menu naming every layout, bin
// — forced the page 150px wider than a 320px phone; that row wraps now. And the
// nested chrome (`px-6` on the column, `p-4` on the card, `pl-9` on the indent)
// came to 88px of a 360px screen, which is what that size was short by; it is
// narrower below `sm`.
//
// A third candidate was written, believed, and is not here: `min-width: 0` on
// every form control, which is the textbook answer to a control refusing to
// shrink below its intrinsic width. Removing it again changed nothing at any of
// these six sizes. A fix that cannot be made to matter is not the fix.
//
// The reason this suite is worth its runtime is the fix that is NOT allowed.
// `overflow-x: hidden` on the page silences exactly this symptom while making
// the overflowing part unreachable instead of visible — and it silences it for
// every future layout too, which is how a whole screen quietly stops fitting.
// So each check here has two halves: the page does not scroll sideways, AND
// nothing above the content is hiding that it would. A future change that
// reaches for the shortcut fails on the second half.
//
// The viewports are real, and both orientations are deliberate: 320 is the
// narrowest phone still in use and the width every other one is safe at, and a
// phone in landscape is a SHORT screen rather than a wide one — which is what
// the stacked sticky bars had to answer to.

/** Phone viewports, portrait and landscape, narrowest first. */
const VIEWPORTS = [
  { name: "portrait 320", width: 320, height: 568 },
  { name: "portrait 360", width: 360, height: 740 },
  { name: "portrait 390", width: 390, height: 844 },
  { name: "landscape 568", width: 568, height: 320 },
  { name: "landscape 667", width: 667, height: 375 },
  { name: "landscape 844", width: 844, height: 390 },
] as const;

/**
 * Asserts a page fits its viewport, and that nothing is hiding that it does.
 *
 * **Catches rightward overflow only.** `scrollWidth - clientWidth` grows when
 * content extends past the RIGHT edge; content pushed off the LEFT edge —
 * exactly what `section-style-popup.tsx`'s own comment on its `right-0`
 * anchor describes — creates no scrollbar and no measurable delta here, so it
 * passes silently. A caller relying on this to catch "any" overflow of a
 * popup or overlay is relying on a direction this cannot see.
 *
 * @param page - the page to measure.
 * @param where - what to name in a failure.
 * @returns nothing.
 */
async function fits(page: Page, where: string): Promise<void> {
  // Next's dev overlay is a fixed element of its own and is not part of the
  // app; it is absent from a production build and must not decide this.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

  const measured = await page.evaluate(`(() => {
    const root = document.documentElement;
    const hiding = ["html", "body", "main"]
      .map((selector) => [selector, document.querySelector(selector)])
      .filter(([, element]) => element)
      .map(([selector, element]) => [selector, getComputedStyle(element).overflowX])
      .filter(([, overflowX]) => overflowX === "hidden" || overflowX === "clip")
      .map(([selector, overflowX]) => selector + ":" + overflowX);
    return { overflow: root.scrollWidth - root.clientWidth, hiding };
  })()`);

  const { overflow, hiding } = measured as {
    overflow: number;
    hiding: string[];
  };

  // A pixel of slack, and no more: sub-pixel rounding is real at a device
  // pixel ratio of 2 and a scrollable page is not.
  expect(overflow, `${where} scrolls sideways by ${overflow}px`).toBeLessThan(
    2,
  );

  // The half that makes the first half mean something. Passing this suite by
  // clipping the page is the one repair that must never look like a fix.
  expect(
    hiding,
    `${where} hides horizontal overflow instead of fitting: ${hiding.join(", ")}`,
  ).toEqual([]);
}

/**
 * Asserts that no two bars pinned to the top of the screen are on top of
 * each other.
 *
 * The editor stacks three — the page header, the toolbar, and the strip naming
 * which language you are writing in — and each was pinned near zero, so the
 * toolbar covered the header and was itself covered by nothing while covering
 * the strip. Nothing errored: the controls were simply painted over, which is
 * why this needs a geometric assertion rather than a visible-element one. An
 * element still counts as visible while another paints across it.
 *
 * Only bars actually on screen are compared. On a short screen the ones marked
 * `short:static` scroll away, and one that has left is not overlapping
 * anything.
 *
 * @param page - the page to measure.
 * @param where - what to name in a failure.
 * @returns nothing.
 */
async function barsDoNotOverlap(page: Page, where: string): Promise<void> {
  const overlaps = (await page.evaluate(`(() => {
    const onScreen = Array.from(document.querySelectorAll("body *"))
      .filter((element) => getComputedStyle(element).position === "sticky")
      .map((element) => ({
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
        what: element.tagName.toLowerCase() + "." + String(element.className).split(" ")[0],
      }))
      .filter((bar) => bar.bottom > 0 && bar.top < document.documentElement.clientHeight);
    const found = [];
    for (let i = 0; i < onScreen.length; i += 1) {
      for (let j = i + 1; j < onScreen.length; j += 1) {
        const a = onScreen[i];
        const b = onScreen[j];
        if (a.top < b.bottom - 1 && b.top < a.bottom - 1) {
          found.push(a.what + " over " + b.what);
        }
      }
    }
    return found;
  })()`)) as string[];

  expect(overlaps, `${where}: pinned bars cover each other`).toEqual([]);
}

test.describe.configure({ mode: "serial" });

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

// The signed-out pages need no Clerk backend, so they are checked whatever the
// environment holds. The editor is where the fault actually was, so it runs
// wherever a session can be made.
test.describe("every phone screen, signed out", () => {
  for (const viewport of VIEWPORTS) {
    test(`sign-in fits ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/es/sign-in");
      await expect(page.getByTestId("wordmark")).toBeVisible();
      await fits(page, `sign-in at ${viewport.name}`);
    });

    test(`a missing page fits ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/es/nobody-has-this-address");
      await expect(page.getByTestId("not-found-title")).toBeVisible();
      await fits(page, `not-found at ${viewport.name}`);
    });
  }
});

test.describe("every phone screen, signed in", () => {
  test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

  for (const viewport of VIEWPORTS) {
    // One session per viewport rather than one per page: signing in is the
    // slow part, and what is being measured is layout, which does not care
    // that three routes shared a session.
    test(`the signed-in pages fit ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signIn(page, await mintTicket(identity!.userId));

      for (const path of ["/es/me", "/es/pages"]) {
        await page.goto(path);
        await expect(page.getByTestId("wordmark")).toBeVisible();
        await fits(page, `${path} at ${viewport.name}`);
      }
    });

    // The editor with EVERYTHING open, which is the state the fault was
    // reported in and the widest this app ever gets: the theme panel's colour
    // rows, and a template's sections with their layout menus and their
    // per-item fields. Checking the empty editor would have passed while the
    // page a person actually builds was still cut in half.
    test(`the editor fits ${viewport.name} with the panel and a template open`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signIn(page, await mintTicket(identity!.userId));

      await page.goto("/es/pages/new");
      await page.getByTestId("theme-open").click();
      await page.getByTestId("template-picker").click();
      await page.getByTestId("template-reference-sheet").click();
      await expect(page.getByTestId("section-name").first()).toBeVisible();

      await fits(page, `the editor at ${viewport.name}`);

      // The complete page is a bounded inline workbench view, not a fake
      // public viewport. Open it at every narrow size and require any excess
      // to remain reachable (`auto`), never clipped to make the page-level
      // overflow measurement flatter.
      await page.getByTestId("complete-page-preview-toggle").click();
      const complete = page
        .getByTestId("complete-page-preview-content")
        .locator("..");
      await expect(complete).toBeVisible();
      expect(
        await complete.evaluate((el) => getComputedStyle(el).overflowX),
      ).toBe("auto");
      await fits(
        page,
        `the editor at ${viewport.name} with the complete preview open`,
      );
      await page.getByTestId("complete-page-preview-toggle").click();

      // The style popup is a real overlay — `position: absolute`, `w-72`,
      // anchored off a section card's own right edge — so the `fits` call
      // above, taken before opening it, proves the PAGE'S OWN layout fits; it
      // says nothing about the popup itself once open. Every field in this
      // panel (skin, background, fit, border) has carried that gap
      // since the popup shipped; checking it here closes it for all of them,
      // not only the border select this task added.
      await page.getByTestId("section-style-open").first().click();
      await expect(page.getByTestId("section-style-panel")).toBeVisible();
      await fits(
        page,
        `the editor at ${viewport.name} with the style popup open`,
      );
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("section-style-panel")).toBeHidden();

      // And scrolled, because the sticky bars only stack once somebody moves:
      // three of them pinned at the top is what made this "chopped" rather
      // than merely narrow, and at the top of the page they are still in flow.
      await page.evaluate(`window.scrollTo(0, 800)`);
      await fits(page, `the scrolled editor at ${viewport.name}`);
      await barsDoNotOverlap(page, `the scrolled editor at ${viewport.name}`);

      // The toolbar is the one bar that never yields — Save must stay
      // reachable however short the screen is. Above it, the header may.
      await expect(page.getByTestId("editor-save")).toBeInViewport();
    });
  }
});

// THE BROWSER-LEVEL CHECK OF A REAL PUBLISHED PAGE.
//
// `public-pages.spec.ts` proves the plumbing and the refusal against addresses
// nobody holds, and says outright that no test renders somebody's actual
// profile. This does, on every portrait size.
//
// **It seeds the page rather than building it in the editor**, which it used to
// do. That began as a workaround — the editor of the day composed a flat list
// of sections and `set_actor_sections` refused it — and it is kept on its own
// merits now that the editor composes blocks: a seed can declare a six-place
// section, which no template does, and it reaches every size without driving
// the editor six times.
//
// It builds ONE page and reads it at every portrait size, rather than one per
// size. Each run leaves a soft-deleted actor row behind — deletion is soft so a
// handle can never be reused — and six of those per run is a footprint this
// does not need to leave to learn the same thing.
test.describe("a published page on a phone", () => {
  test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

  test("stacks its places instead of scrolling them sideways", async ({
    page,
  }) => {
    // The widest section the model admits, with a place left empty in the
    // middle of it. Below the section's own narrow threshold every one of
    // those places collapses to a single column, and the whole point of
    // putting the count in a `@`-prefixed class rather than an inline
    // `grid-template-columns` is that a query can do that and an inline style
    // cannot. The empty place is here because it is the one thing on this page
    // that holds room without holding content — a phone is where a section
    // that failed to collapse would push the row past the viewport, and an
    // empty place must collapse with the rest rather than keeping a column of
    // its own.
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "cards",
      displayName: "Cards",
      blocks: [
        container({
          name_en: "Wide",
          mode: "grid",
          spaces: 6,
          children: [
            leaf({ title_en: "One" }),
            leaf({ title_en: "Two" }),
            null,
            leaf({ title_en: "Four" }),
          ],
        }),
      ],
    });

    for (const viewport of VIEWPORTS.filter((size) => size.width < 640)) {
      await page.setViewportSize(viewport);
      await page.goto(`/es/${address}/${handle}`);
      await expect(page.getByTestId("block-grid")).toBeVisible();

      await fits(page, `the published page at ${viewport.name}`);

      // The assertion the change is about, and `fits` cannot make it: a row
      // that scrolls sideways INSIDE a page which itself does not is the
      // gesture most often missed entirely, and the page's own overflow stays
      // zero throughout. Measuring the container's own scrollWidth catches it
      // where the document's cannot.
      const grid = (await page.evaluate(`(() => {
        const row = document.querySelector('[data-testid="block-grid"]');
        return [row.scrollWidth, row.clientWidth];
      })()`)) as [number, number];
      const [content, visible] = grid;
      expect(
        content,
        `the grid at ${viewport.name} scrolls sideways by ${content - visible}px`,
      ).toBeLessThanOrEqual(visible + 1);
    }
  });
});
