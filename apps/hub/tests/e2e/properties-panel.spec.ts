import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintTicket,
  signIn,
  type TestIdentity,
} from "./support/clerk-session";
import { addBlock, openPageAdd } from "./support/editor";

// THE PROPERTIES PANEL, RENAMED FROM `canvas-inspector.spec.ts` (2026-09-04).
//
// Phase 3 of the Carrd-style page builder deleted the recursive Items/Options
// inspector (`presentation/canvas-inspector.tsx`, `presentation/
// inspector-items.tsx`) and replaced it with `presentation/properties-panel.tsx`
// — exactly two tabs per selection kind, no Items list, no breadcrumbs, no
// Back. Selection happens only by clicking a block on the live canvas, or
// `select-page` for the page itself.
//
// This file carries every case from `canvas-inspector.spec.ts` that still
// describes a mechanism the Properties panel HAS — starting closed, Page
// selection, Escape/empty-canvas dismissal, Preview clearing selection, the
// refusal-summary layering, and Close working from any depth — updated to the
// new ids and the new tab meanings. Three cases from that file are NOT here,
// because the mechanism they proved no longer exists at all rather than
// having moved:
//
//  * "Items enters one section without mounting its descendants in Options" —
//    proved that entering a container's Items pane did not also mount its
//    Options pane's descendants. There is no Items/Options split for a
//    container any more: `BlockCard` is rendered with `showChildren={false}`
//    on the panel's own primary tab, so a container's children are NEVER
//    mounted by the panel at all, under any tab. The guarantee this case
//    checked is now true unconditionally, by construction, rather than by an
//    Items/Options distinction — there is nothing left to regress.
//  * "Page, nested containers, Back, breadcrumbs, and leaf Options form one
//    path" — entirely about `inspector-breadcrumb`/`inspector-back`, both of
//    which are gone with no replacement. There is no "one path" to walk any
//    more; a block is selected directly, once, by clicking it.
//  * "an empty positional place remains visible and can be filled" — the
//    literal assertions (`inspector-item-row` count, `inspector-back`) are
//    gone, but the underlying claim — an empty place keeps rendering, and
//    keeps its own width, once a sibling place is filled — is still real and
//    still worth proving. It is ported below as "a sibling place stays empty
//    and rendered once one place is filled", using the canvas's own
//    `data-canvas-path` wrapper (mounted for every place, filled or not)
//    rather than a row the Items list used to draw.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("the panel starts closed, then Page exposes identity on primary and theme on secondary", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("properties-panel")).toBeVisible();
  // **No tab click is needed for the identity fields (2026-09-04).**
  // `enterSelection` always resets to the primary tab, and Page's primary tab
  // is the identity fields together with the add palette — a swap from the
  // old model, where Options held the fields and Items held the palette.
  await expect(page.getByTestId("editor-handle")).toBeVisible();
  await page.getByTestId("panel-tab-secondary").click();
  await expect(page.getByTestId("theme-open")).toBeVisible();
});

test("a sibling place stays empty and rendered once one place is filled", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  // **A fresh fursona already carries one section — the identity header, at
  // path `"0"`** (`withRequiredBlocks` composes it the moment the form
  // opens; see `support/blocks.ts`'s `SEEDED_IDENTITY_SECTIONS`). The
  // section this test adds through the page-level palette is therefore the
  // SECOND top-level one, path `"1"`, not `"0"`.
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
  // A freshly added section starts at two places, both empty, each
  // rendering `public-space` inside its own `data-canvas-path` wrapper —
  // present for every place, filled or not, in the editor as much as on a
  // public page.
  await expect(page.locator('[data-canvas-path^="1-"]')).toHaveCount(2);

  // The section itself is already selected, on its own primary tab, so the
  // one global Add targets it directly.
  await addBlock(page, { kind: "text" });
  await page.getByTestId("leaf-title").fill("Filled");

  // The first place is now a real block, addressable by `data-block-path`;
  // the second is still an empty place, which — unlike a filled one — never
  // carries `data-block-path` at all.
  await expect(page.locator('[data-block-path="1-0"]')).toHaveCount(1);
  await expect(page.locator('[data-block-path="1-1"]')).toHaveCount(0);
  await expect(
    page.locator('[data-canvas-path="1-1"]').getByTestId("public-space"),
  ).toHaveCount(1);
});

test("a click owned by the empty canvas dismisses the panel", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  await page
    .getByTestId("editor-canvas")
    .evaluate((canvas) => (canvas as HTMLElement).click());
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
});

test("Escape closes the panel and leaves the live page", async ({ page }) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("properties-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.getByTestId("select-page")).toBeVisible();
});

test("Escape aimed at a field inside the panel keeps the selection", async ({
  page,
}) => {
  // **A REGRESSION TEST, ported to a different fixture than the one it was
  // written against.** The fault this guards against was found on
  // `SectionStylePopup`, which used to close itself from a bubble-phase
  // `document` listener — React had flushed that close before a bubble-phase
  // listener in `BlockEditor` ran, so `event.target` was already detached and
  // `target.closest('[data-testid="canvas-inspector"]')` answered null for a
  // field that had genuinely been inside it. The fix moved `BlockEditor`'s own
  // Escape listener to the CAPTURE phase, which runs before ANY bubble-phase
  // closer — native or React's own synthetic dispatch — can remove anything.
  // That fix is unconditional on WHICH control is closing, so the popup's own
  // disappearance (its fields are inline on the Appearance tab now, with no
  // trigger and no separate panel to close) does not retire the regression:
  // `IconPicker` is the current example of a control nested in the panel that
  // closes itself on Escape via an ordinary React `onKeyDown` — bubble-phase
  // by construction, exactly like the fault this test was written for.
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await addBlock(page, { kind: "link" });
  await expect(page.getByTestId("leaf-kind")).toHaveValue("link");

  const trigger = page
    .getByTestId("leaf-editor")
    .locator("button[aria-expanded]")
    .first();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");

  // The picker closed — so the Escape was delivered and acted on, which is
  // what stops this passing on a build where the key reached nothing at all.
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  // And the leaf's own fields are still where a person can use them —
  // asserting the panel is merely attached would pass against a build that
  // deselected and then reselected nothing, which this is not testing for.
  await expect(page.getByTestId("leaf-kind")).toBeVisible();
});

test("Preview clears the selected panel instead of pausing it", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("properties-panel")).toBeVisible();
  await page.getByTestId("hide-controls").click();
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
  await expect(page.getByTestId("select-page")).toBeHidden();
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  await page.getByTestId("show-controls").click();
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
  await expect(page.getByTestId("select-page")).toBeVisible();
});

// THE REFUSAL SUMMARY MUST NOT BE BEHIND THE PANEL.
//
// The panel is a `fixed` right column from `md` up, and the canvas section
// pads itself by `md:pl-[min(36rem,40vw)]` to make room. The banner was a
// SIBLING of that section, so it got no such padding and the panel simply sat
// on top of it — at 1280 its heading was at x=41 with the panel's right edge
// at x=512. It is a child of the padded section now.
//
// **A rect comparison is the wrong instrument and would have passed.** Two
// boxes overlapping is not the claim; which one a person can read is, and
// only `elementFromPoint` answers that. The banner is asserted to have text
// first, because a hit test over an element that never rendered would report
// "not covered by the panel" for the worst possible reason.
test("the save-refusal summary is readable while the panel is open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");

  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  // A new fursona has no handle, which the write schema refuses — so Save
  // produces the banner rather than navigating away.
  await page.getByTestId("editor-save").click();
  const banner = page.getByTestId("editor-error-banner");
  await expect(banner).toBeVisible();
  expect((await banner.innerText()).trim().length).toBeGreaterThan(0);

  // **THE ROOM THE SECTION MAKES IS ANIMATED, so a hit test fired the moment
  // the banner appears catches the banner still travelling out from under the
  // panel (2026-09-04).** The section carries `transition-[padding-left]
  // duration-210`, and this case read the pad mid-slide at **440.553px** and
  // **218.792px** of its settled 512 in two runs — so the panel was genuinely
  // on top of the heading at the instant asked, and the answer was about
  // WHEN rather than about the layout. It passed alone and failed in the file
  // for that reason alone, which is a race rather than a machine being slow:
  // no timeout is long enough for a question asked too early.
  //
  // The wait is stated as the relationship instead of as 512, because both
  // boxes come from one expression — the panel is `md:w-[min(36rem,40vw)]`
  // and the pad is `md:pr-[min(36rem,40vw)]` (padding-RIGHT: the panel sits
  // on the desktop right now, not the left). Should those ever diverge, this
  // poll is what says so rather than silently comparing a stale constant.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pad = Number.parseFloat(
          getComputedStyle(document.querySelector("[data-editor-stack]")!)
            .paddingRight,
        );
        const panel = document
          .querySelector('[data-testid="properties-panel"]')!
          .getBoundingClientRect().width;
        return Math.round(pad - panel);
      }),
    )
    .toBe(0);

  const reading = await page.evaluate(() => {
    const heading = document.querySelector(
      '[data-testid="editor-error-banner"] p',
    )!;
    const box = heading.getBoundingClientRect();
    const topmost = document.elementFromPoint(box.left + 8, box.top + 8);
    const panel = document.querySelector('[data-testid="properties-panel"]')!;
    return {
      headingRight: box.right,
      panelLeft: panel.getBoundingClientRect().left,
      coveredByPanel: Boolean(topmost && panel.contains(topmost)),
      topmost: topmost?.tagName ?? "none",
    };
  });

  expect(
    reading.coveredByPanel,
    `the panel is on top of the banner's heading (${reading.topmost})`,
  ).toBe(false);
  // And it is clear of the panel rather than merely un-hit by one pixel.
  // **The panel sits on the desktop RIGHT (2026-09-04), not the left** — see
  // this test's own header comment — so clearing it means the heading's
  // RIGHT edge stays at or before the panel's LEFT edge, the mirror of the
  // original left-panel assertion this test was ported from.
  expect(reading.headingRight).toBeLessThanOrEqual(reading.panelLeft);
});

test("the panel closes itself directly from a nested leaf", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
  await addBlock(page, { kind: "text" });
  await expect(page.getByTestId("leaf-kind")).toBeVisible();

  await page.getByTestId("panel-close").click();

  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
  await expect(page.getByTestId("editor-save")).toBeVisible();
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
});
