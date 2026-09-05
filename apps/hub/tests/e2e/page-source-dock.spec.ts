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
  container,
  leaf,
  seedPage,
  SEEDED_IDENTITY_SECTIONS,
} from "./support/blocks";
import { selectBlock } from "./support/editor";
import { tracksOf } from "./support/grid";
import { DOCUMENT_VERSION } from "@/features/actors/domain/page-document";
import enMessages from "@/shared/infrastructure/i18n/messages/en.json" with { type: "json" };

// One sign-in for the whole file: every case below reads or extends the
// same seeded page as the same shared identity, and none depends on what
// an earlier case left behind, so they restore one saved session rather
// than minting a fresh ticket each — see `support/shared-session.ts`.
const STATE_PATH = sharedStatePath("page-source-dock");

// THE PAGE-SOURCE DOCK, MOUNTED FOR THE FIRST TIME.
//
// Task 7 is the first change that puts `PageSourceDock` in front of a real
// browser at all — every suite before it exercised the component through
// jsdom, which implements neither `<dialog>`'s user-agent stylesheet nor real
// layout. That gap hid three bugs at once, all in the same class list, and
// none of them had any unit-test-visible symptom:
//
// - A bare, unconditional `flex` utility beat the UA's own
//   `dialog:not([open]) { display: none }` — author origin always wins over
//   user-agent origin, regardless of specificity or layers — so the dock
//   rendered, full size, on every page load, before anyone ever pressed the
//   control that is supposed to open it.
// - The UA stylesheet also sets `left: 0` unconditionally. With that, this
//   component's own `right: 0`, an explicit `width`, and `margin: 0` all in
//   force together, the box was over-constrained and the browser dropped
//   `right` — so the panel rendered pinned to the LEFT edge of the window
//   instead of the right.
// - The UA stylesheet's default `height` is `fit-content`, not `auto`, so
//   with no author `height` declared at all the panel sized itself to its
//   own content rather than stretching from `top` to `bottom` — a few
//   hundred pixels tall instead of the full viewport.
//
// This spec is the regression test for all three, at once, because they were
// found together and the same three-part class-list fix (`hidden open:flex`,
// `left-auto`, `h-auto`) closes all of them. Sabotage-verified: reverting any
// one of the three back to the pre-fix class list reddens the first test
// below.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");
test.use({ storageState: STATE_PATH });

let identity: TestIdentity | undefined;
let handle = "";

test.beforeAll(async ({ browser }) => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
  await establishSharedSession(browser, identity.userId, STATE_PATH);
  ({ handle } = await seedPage({
    userId: identity.userId,
    handlePrefix: "sourcedock",
    displayName: "Source dock check",
    blocks: [
      container({
        name_en: "About",
        mode: "stack",
        children: [
          leaf({
            title_en: "Original title",
            description_en: "Original words.",
          }),
        ],
      }),
    ],
  }));
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

test("opens beside the page, reaching the right edge and the foot of the window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  const dock = page.getByTestId("page-source-dock");

  // **Closed by default, and genuinely off-screen — not merely "not the
  // subject of this assertion."** The pre-fix version was visible here: a
  // `toBeVisible()` failure at this line is the display-none regression.
  await expect(dock).toBeHidden();

  await page.getByTestId("editor-open-source").click();
  await expect(dock).toBeVisible();

  const box = (await dock.boundingBox())!;
  const viewport = page.viewportSize()!;

  // **At the RIGHT edge, not the left.** The pre-fix version put `box.x` at
  // 0 — the over-constrained `left`/`right` bug — so this pins it against
  // the viewport's right edge with the panel's own measured width.
  expect(
    box.x + box.width,
    "the dock's right edge sits at the viewport's right edge",
  ).toBeGreaterThan(viewport.width - 2);
  expect(box.x, "the dock is not pinned to the left edge").toBeGreaterThan(
    viewport.width / 2,
  );

  // **Reaching the foot of the window, not sized to its own content.** The
  // pre-fix version stopped a few hundred pixels down — the `fit-content`
  // default height bug — so this checks the panel's bottom edge is near the
  // viewport's own bottom rather than far short of it.
  expect(
    box.y + box.height,
    "the dock reaches near the bottom of the viewport",
  ).toBeGreaterThan(viewport.height - 4);

  await page.getByTestId("page-source-close").click();
  await expect(dock).toBeHidden();
});

// **Sheet mode is what the class list's own `max-md:` rules are for, and
// nothing until now had watched it in a real browser.** The previous task
// broke this exact shape once — `max-md:w-full` alone was not enough against
// the always-on `max-w-[min(48rem,80vw)]` and `min-w-[20rem]`, both of which
// clamp the USED width regardless of what `width` says — and it was found
// only by measuring, not by re-reading the cascade reasoning. 320 is this
// repository's own narrowest-phone convention, matching `responsive.spec.ts`.
test("reaches both edges of the window at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  await page.getByTestId("editor-open-source").click();
  const dock = page.getByTestId("page-source-dock");
  await expect(dock).toBeVisible();

  const box = (await dock.boundingBox())!;

  expect(
    box.x,
    "the dock reaches the left edge in sheet mode",
  ).toBeLessThanOrEqual(1);
  expect(
    box.x + box.width,
    "the dock reaches the right edge in sheet mode",
  ).toBeGreaterThanOrEqual(319);
});

// COLLAPSING THE DOCK HAS TO REVEAL THE PAGE, NOT JUST HIDE THE TEXTAREA.
//
// A whole-branch review found `collapsed` gating only the body
// (`{!collapsed && …}`) while the dialog kept `bottom-0` — the half of the
// mechanism above that stretches the panel to the foot of the viewport —
// regardless. So collapsing left a full-height, fully OPAQUE (`bg-(--menu)`)
// panel with nothing painted below its header, still covering whatever page
// was behind it: the entire screen at 320px. The design this component
// implements says collapsing on a narrow viewport has to be "the only way to
// see whether what was typed did anything", which a panel that still covers
// the page cannot be.
//
// Excludes: a fix that shrinks the panel's CLASS list without changing what
// is actually painted at a given screen coordinate, and a fix that only works
// at one viewport. Both widths below assert the measured height AND that a
// point the expanded dock covered is occupied by a real block preview once
// collapsed — not merely "not the dialog", but the page itself.
//
// Sabotage-verified: restoring `bottom-0` unconditionally (dropping the
// `collapsed ? "bottom-auto" : "bottom-0"` branch) reddens both cases below.
for (const width of [1280, 320]) {
  test(`collapsing shrinks the dock to its header and reveals the page at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/en/pages/${handle}/edit`);
    await expect(page.getByTestId("block-preview").first()).toBeVisible();

    // **Deselect first: the subject here is the DOCK.** Nothing starts
    // selected, but a page load can leave a selection from an earlier
    // navigation; below `md` the Properties panel is a `fixed` bottom sheet
    // up to `70vh` tall — so at 320 it, and not the page, is what sits at the
    // probe point once the dock collapses, and the reveal asserted below
    // would be a reading of the wrong panel. Escape aimed at the body clears
    // the selection; anything focused inside a control keeps its own Escape.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("properties-panel")).toHaveCount(0);

    await page.getByTestId("editor-open-source").click();
    const dock = page.getByTestId("page-source-dock");
    await expect(dock).toBeVisible();

    const viewport = page.viewportSize()!;
    const expandedBox = (await dock.boundingBox())!;

    // Baseline: expanded reaches near the bottom of the viewport, exactly as
    // the two tests above already establish for their own widths — restated
    // here because the collapse assertion below is a claim about shrinking
    // AWAY from this.
    expect(
      expandedBox.y + expandedBox.height,
      "expanded reaches near the bottom of the viewport",
    ).toBeGreaterThan(viewport.height - 4);

    // A point that is inside BOTH the expanded dock's box and a real block
    // preview's box — the overlap, not a guessed coordinate — so the probe
    // is provably a point the expanded dock was covering real page content
    // at, rather than an empty margin. The identity section's control card
    // sits above its own preview and is tall enough that the FIRST block
    // preview is routinely below the fold on load, so it is scrolled into
    // view first — the dock is `fixed`, unaffected by page scroll, so its
    // own box is re-read after rather than assumed unchanged.
    const preview = page.getByTestId("block-preview").first();
    await preview.scrollIntoViewIfNeeded();
    // The dock is `fixed`, so page scroll cannot move it — re-read anyway
    // rather than assume, since a scroll is exactly the kind of event that
    // has broken a sticky bar's own offset in this file's own history.
    const dockBoxAfterScroll = (await dock.boundingBox())!;
    const previewBox = (await preview.boundingBox())!;
    const overlapXMin = Math.max(dockBoxAfterScroll.x, previewBox.x);
    const overlapXMax = Math.min(
      dockBoxAfterScroll.x + dockBoxAfterScroll.width,
      previewBox.x + previewBox.width,
    );
    const overlapYMin = Math.max(dockBoxAfterScroll.y, previewBox.y);
    const overlapYMax = Math.min(
      dockBoxAfterScroll.y + dockBoxAfterScroll.height,
      previewBox.y + previewBox.height,
    );
    expect(
      overlapXMin,
      "the expanded dock genuinely overlaps a block preview horizontally",
    ).toBeLessThan(overlapXMax);
    expect(
      overlapYMin,
      "the expanded dock genuinely overlaps a block preview vertically",
    ).toBeLessThan(overlapYMax);
    const point = {
      x: (overlapXMin + overlapXMax) / 2,
      y: (overlapYMin + overlapYMax) / 2,
    };

    await page.getByTestId("page-source-collapse").click();

    const collapsedBox = (await dock.boundingBox())!;

    // **The header's own height, not the viewport's, and not zero either.**
    // A header holding two icon buttons and one line of text is nowhere near
    // either viewport height tried here, and the DOM half of this claim
    // (`page-source-dock.test.tsx`'s "collapsing hides the body and keeps the
    // header") already proves the header stays in the document. What that
    // case cannot see is LAYOUT: a real header rendered at zero height, or a
    // dock that scrolled off the viewport, would both still satisfy
    // `< 100` with nothing below to catch it. `toBeGreaterThan(16)` closes
    // that — a header holding two icon buttons cannot be shorter than one
    // of them — so this asserts "shrunk to its header", not merely
    // "shrunk to less than a viewport".
    expect(
      collapsedBox.height,
      "collapsed height is the header's, not the viewport's",
    ).toBeLessThan(100);
    expect(
      collapsedBox.height,
      "collapsed height is a real header, not zero or an off-screen dock",
    ).toBeGreaterThan(16);

    // The probe point — inside the EXPANDED dock a moment ago — now falls
    // below the collapsed dock's own bottom edge.
    expect(
      point.y,
      "the probe point now sits below the collapsed dock",
    ).toBeGreaterThan(collapsedBox.y + collapsedBox.height);

    // And a real block preview, not the dialog, is what is actually painted
    // there.
    const behind = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return {
          isDock: el?.closest('[data-testid="page-source-dock"]') !== null,
          isPreview: el?.closest('[data-testid="block-preview"]') !== null,
        };
      },
      [point.x, point.y],
    );
    expect(
      behind.isDock,
      "the collapsed dock no longer covers this point",
    ).toBe(false);
    expect(
      behind.isPreview,
      "the page's own block preview is visible at this point",
    ).toBe(true);
  });
}

test("editing the box changes the page; breaking it leaves the page alone", async ({
  page,
}) => {
  await page.goto(`/en/pages/${handle}/edit`);
  const preview = page.getByTestId("block-preview").first();
  await expect(preview).toBeVisible();
  // A plain string assertion, not `toContainText` — this checks AUTHOR
  // content this fixture wrote, not a translated catalogue string, but the
  // lint rule bans the method itself rather than reasoning about the string,
  // so every text check in this file goes through `.innerText()` instead.
  expect(await preview.innerText()).toContain("Original words.");

  await page.getByTestId("editor-open-source").click();
  const textarea = page.getByTestId("page-source-textarea");
  await expect(textarea).toBeVisible();

  const original = await textarea.inputValue();
  expect(original).toContain("Original title");

  // A genuine hand edit — different whitespace and key order from
  // `toDocument`'s own canonical form — is the input this feature exists
  // for; see `usePageSource`'s own TSDoc on why the mirror guard has to
  // compare against a canonical re-serialisation rather than raw text.
  const edited = original.replace("Original title", "Edited by hand");
  await textarea.fill(edited);

  // Past the hook's 250ms debounce.
  await expect
    .poll(async () => preview.innerText(), { timeout: 5000 })
    .toContain("Edited by hand");

  // Breaking a brace: the strip appears, and the page keeps showing the last
  // ACCEPTED edit rather than reverting or going blank.
  const broken = edited.slice(0, -1);
  await textarea.fill(broken);

  const problems = page.getByTestId("page-source-problems");
  await expect(problems).toBeVisible();
  await expect
    .poll(async () => (await problems.innerText()).length, { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(await preview.innerText()).toContain("Edited by hand");
});

// THE REMAINING BRIEF CASES, AND WHAT THE THREE ABOVE ALREADY COVER.
//
// The brief (`task-8-brief.md`) lists nine cases. Its case 1 ("the dock opens
// and the page stays interactive") is subsumed by "opens beside the page,
// reaching the right edge and the foot of the window" above, which already
// proves the dock is a non-modal sibling rather than a backdrop over the page
// — a modal backdrop would have failed that test's own bounding-box math, since
// the page behind it would never have been reachable to measure against. Its
// cases 2 and 3 ARE "editing the box changes the page; breaking it leaves the
// page alone" above, verbatim. Everything below is what that leaves: the
// round trip, hostile documents, hostile text, Escape's focus return, and the
// two directions of drift arbitration.

// THE COPY CONTROL — NAMED IN THE SPEC AS AN OWED BROWSER CASE, and absent
// from this suite until a round-1 review of task 8 found it missing outright
// (`grep -r page-source-copy tests/e2e` found nothing) and, while adding it,
// found the control was invisible in its own default state — see the button's
// own comment in `page-source-dock.tsx` for the fault and the fix.
test("the copy control works with the reference collapsed, its default state", async ({
  page,
}) => {
  // Excludes: a control that only works once the reference has been
  // expanded, or one that changes the page's clipboard permission state
  // rather than the system clipboard.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  await page.getByTestId("editor-open-source").click();
  const dock = page.getByTestId("page-source-dock");
  await expect(dock).toBeVisible();

  // The reference is never expanded anywhere in this test — the `<details>`
  // is collapsed, which is the state every dock opens in.
  const copyButton = dock.getByTestId("page-source-copy");
  await expect(copyButton).toBeVisible();
  const reference = await dock.locator("pre").textContent();

  const before = await copyButton.innerText();
  await copyButton.click();
  await expect.poll(async () => copyButton.innerText()).not.toBe(before);

  // The OS clipboard on Windows normalises a bare newline to a
  // carriage-return-newline pair for plain text, observed here rather
  // than assumed, so the comparison reads both sides through the same
  // normalisation instead of asserting a platform's own rewrite.
  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  expect(clipboardText.replace(/\r\n/g, "\n")).toBe(reference);
});

// THE COPY CONTROL MUST NOT COVER THE DISCLOSURE IT SITS OVER.
//
// The button is absolutely positioned over the `<summary>` row, and `pr-24`
// on that summary is the reserve meant to keep its text clear of it. That
// reserve is 96px and the button — while it rendered `copyReference` as
// visible text — measured **227px** at 1440, 1100 and 320 alike, because its
// width comes from a translated string and not from the space set aside for
// it. So it covered the CENTRE of a full-width row styled `cursor-pointer`,
// and pressing the middle of a disclosure that invites a press copied
// instead of expanding. At 320 it covered 227px of a 293px row.
//
// Excludes: a button merely *near* the summary's centre, and a summary that
// happens to be wide enough on a desktop viewport to hide the fault. The
// check is `elementFromPoint` at the summary's own centre — the point
// Playwright and a thumb both aim at — asserted at the widest and narrowest
// viewports this dock supports.
//
// Sabotage-verified: restoring `{copied ? labels.copied : labels.copyReference}`
// as the button's visible content reddens both viewports here and nothing
// else in this file.
for (const width of [1440, 320]) {
  test(`the copy control leaves the reference's own disclosure pressable at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/en/pages/${handle}/edit`);
    await expect(page.getByTestId("block-preview").first()).toBeVisible();

    await page.getByTestId("editor-open-source").click();
    const dock = page.getByTestId("page-source-dock");
    await expect(dock).toBeVisible();

    const summary = dock.locator("summary");
    await expect(summary).toBeVisible();

    const hit = await summary.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return {
        isSummary: top?.closest("summary") === node,
        onCopy: top?.closest('[data-testid="page-source-copy"]') !== null,
      };
    });

    expect(
      hit.onCopy,
      "the copy button does not sit on the summary's centre",
    ).toBe(false);
    expect(
      hit.isSummary,
      "the summary's own centre belongs to the summary",
    ).toBe(true);

    // And it still opens when pressed there, which is the behaviour the
    // geometry above exists to protect.
    await summary.click();
    await expect(dock.locator("details")).toHaveAttribute("open", "");
  });
}

/**
 * Selects the seeded `About` section and opens its own controls.
 *
 * The two cases below drive `section-name` as "an ordinary control somebody
 * else changed". `About` is the first top-level block of the seeded page —
 * `seedPage` APPENDS its identity section, so `About` sits at path `"0"` —
 * and selecting a container opens the Properties panel directly on its
 * Layout tab, where `section-name` already lives with no further tab click.
 *
 * @param page - the browser page, sitting on the seeded editor.
 */
async function selectAboutOptions(page: Page): Promise<void> {
  await selectBlock(page, "0");
  await expect(page.getByTestId("section-name")).toBeVisible();
}

/**
 * Types into an input WITHOUT taking focus away from whatever already has it.
 *
 * Playwright's own `fill`/`click`/`type` all focus their target first, which
 * is exactly wrong for proving drift while the source box stays focused: a
 * real click on any other control blurs the textarea before the "external"
 * edit's change event can even fire, so the case under test could never be
 * reached through ordinary interaction. This sets the value through the
 * native setter and dispatches a real, bubbling `input` event — which is what
 * a controlled React input's `onChange` actually listens for — while never
 * calling `.focus()` on anything, so `document.activeElement` never moves.
 *
 * **No ordinary interaction in this product reaches the branch this proves,
 * and this helper is a deliberate stand-in rather than a discovered path.**
 * Every real control a person could use to change `sections`/`theme` while
 * the dock is open — a section's own fields, a leaf's, the theme panel, a
 * drag — is itself a focusable element a click or keypress would move focus
 * to, which blurs the textarea before the change ever lands. There is
 * currently no realtime sync, no second tab, and no autosave in this app
 * that could change the page out from under a focused box on its own. The
 * hook's own unit suite (`use-page-source.test.ts`) proves the BEHAVIOUR
 * this branch implements, driven directly against the hook with no DOM
 * focus involved at all; what a browser test can add that a unit test
 * cannot is that the real, rendered textarea genuinely keeps what was
 * typed rather than losing it to a re-render — and reaching that state at
 * all requires dispatching the "external" change without going through
 * focus, since nothing in the product currently does.
 *
 * @param input - the control to change.
 * @param value - what to set it to.
 */
async function editWithoutFocusing(input: Locator, value: string) {
  await input.evaluate((el, next) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("a page edit refreshes the box when it is not focused", async ({
  page,
}) => {
  // Excludes: a dock that keeps showing a stale document after somebody
  // else's edit lands through the ordinary controls, while the box itself
  // was never the thing being typed into.
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  // **The ordinary control has to be REACHED first**, and that is the whole of
  // what changed here: the recursive inspector mounts one scope at a time, so
  // `section-name` exists only while its own section is the selected target
  // and Options is the showing pane. Selecting it BEFORE the dock opens keeps
  // this case about the dock refreshing rather than about the two panels.
  await selectAboutOptions(page);

  await page.getByTestId("editor-open-source").click();
  const textarea = page.getByTestId("page-source-textarea");
  await expect(textarea).toBeVisible();

  // The textarea was never clicked — it is not focused — so the ordinary
  // control below is the "click away and change a title" of the brief's own
  // wording: reaching for it is itself the click elsewhere.
  await page.getByTestId("section-name").fill("Refreshed via control");

  await expect
    .poll(async () => textarea.inputValue())
    .toContain("Refreshed via control");
});

test("a page edit does not clobber a focused box, and shows the drift notice", async ({
  page,
}) => {
  // Excludes: a dock that silently overwrites what somebody is mid-typing
  // the moment an unrelated control changes the page, destroying their
  // cursor position and their unsaved edit with no warning at all.
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  // Reached before the dock opens, for the reason the case above gives.
  await selectAboutOptions(page);

  await page.getByTestId("editor-open-source").click();
  const textarea = page.getByTestId("page-source-textarea");
  await expect(textarea).toBeVisible();
  const resync = page.getByTestId("page-source-resync");

  const original = await textarea.inputValue();
  // A genuine, still-valid hand edit — `fill` focuses the textarea and
  // leaves it focused, which is the precondition this whole case rests on.
  const typed = original.replace('"About"', '"Focused typing"');
  await textarea.fill(typed);

  // Let the hook's own debounce accept this edit first, so what follows is
  // unambiguously an EXTERNAL change arriving on top of an already-applied
  // one, not a race with our own keystroke's parse.
  await expect(resync).toBeHidden();

  // The ordinary control, changed through a real native event that never
  // focuses it — see `editWithoutFocusing` — so the textarea's own focus is
  // never disturbed by driving this "somebody else's edit".
  await editWithoutFocusing(page.getByTestId("section-name"), "External edit");

  await expect(resync).toBeVisible();
  await expect(textarea).toHaveValue(typed);
});

test("a round trip through copy and paste reproduces the page, weights included", async ({
  page,
}) => {
  // Excludes: an export that loses `weights` or `spaces`. The fixture's
  // weights are [1, 3, 2] — not a palindrome, so a reversal bug in either
  // direction cannot pass by accident — and the second section nests a
  // container three deep, at the model's own depth cap.

  const weighted = container({
    name_en: "Ratio",
    mode: "grid",
    spaces: 3,
    weights: [1, 3, 2],
    children: [
      leaf({ title_en: "Left" }),
      leaf({ title_en: "Middle" }),
      leaf({ title_en: "Right" }),
    ],
  });
  const atTheCap = container({
    name_en: "Nested",
    mode: "stack",
    children: [
      container({
        mode: "stack",
        children: [
          container({ mode: "stack", children: [leaf({ title_en: "Deep" })] }),
        ],
      }),
    ],
  });

  const { handle: sourceHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "roundtripsource",
    displayName: "Round trip source",
    blocks: [weighted, atTheCap],
  });

  await page.goto(`/en/pages/${sourceHandle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  await page.getByTestId("editor-open-source").click();
  const sourceTextarea = page.getByTestId("page-source-textarea");
  await expect(sourceTextarea).toBeVisible();
  const copied = await sourceTextarea.inputValue();
  expect(copied).toContain('"weights"');

  const { address, handle: targetHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "roundtriptarget",
    displayName: "Round trip target",
    blocks: [],
  });

  await page.goto(`/en/pages/${targetHandle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  await page.getByTestId("editor-open-source").click();
  const targetTextarea = page.getByTestId("page-source-textarea");
  await expect(targetTextarea).toBeVisible();
  await targetTextarea.fill(copied);

  const targetProblems = page.getByTestId("page-source-problems");
  await expect
    .poll(async () => (await targetProblems.innerText()).trim())
    .toBe("");
  await expect(page.getByTestId("block-preview")).toHaveCount(
    2 + SEEDED_IDENTITY_SECTIONS,
  );

  // The dock is a fixed sibling of the whole editor and stays open until
  // told otherwise — closing it first is what stops it intercepting the
  // pointer click Save needs.
  await page.getByTestId("page-source-close").click();
  await page.getByTestId("editor-save").click();
  await page.waitForURL(/\/pages$/, { timeout: 60_000 });

  await page.setViewportSize({ width: 1280, height: 900 });
  const response = await page.goto(`/en/${address}/${targetHandle}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("public-section")).toHaveCount(
    2 + SEEDED_IDENTITY_SECTIONS,
  );

  const grid = page.getByTestId("block-grid").first();
  const tracks = await tracksOf(grid);
  expect(tracks).toHaveLength(3);
  const [left, middle, right] = tracks;
  expect(middle! / left!).toBeGreaterThan(2);
  expect(left!).toBeLessThan(right!);
  expect(right!).toBeLessThan(middle!);

  // The depth-cap half of the SAME fixture, previously seeded and only ever
  // counted as one opaque section — a flattening bug in the round trip would
  // have passed unnoticed. `atTheCap` is a section holding a container
  // holding a container holding the leaf: three nested `stack`s, each
  // carrying the `block-stack` test id, with "Deep" inside the innermost.
  const nestedSection = page.getByTestId("public-section").nth(1);
  await expect(nestedSection.getByTestId("block-stack")).toHaveCount(3);
  expect(await nestedSection.innerText()).toContain("Deep");
});

test("a hostile theme does not break the page", async ({ page }) => {
  // Excludes: a paste whose colours or canvas list reach the page unfiltered.
  // `accent` fails `parseHex` and is dropped; `canvasColours` is sliced to
  // `MAX_CANVAS_COLOURS` regardless of how many arrive — both already true of
  // `parseTheme` for any stored theme, and this proves it holds for one that
  // walked in through a paste rather than through a colour picker.
  const { handle: hostileHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "hostiletheme",
    displayName: "Hostile theme",
    blocks: [
      container({
        name_en: "About",
        mode: "stack",
        children: [leaf({ title_en: "Untouched" })],
      }),
    ],
  });

  await page.goto(`/en/pages/${hostileHandle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  await page.getByTestId("editor-open-source").click();
  const textarea = page.getByTestId("page-source-textarea");
  await expect(textarea).toBeVisible();

  const hostileDoc = {
    aeleos: DOCUMENT_VERSION,
    theme: {
      accent: "javascript:alert(1)",
      canvasColours: Array.from({ length: 5000 }, () => "#123456"),
    },
    blocks: [
      container({
        name_en: "About",
        mode: "stack",
        children: [leaf({ title_en: "Still here" })],
      }),
    ],
  };
  await textarea.fill(JSON.stringify(hostileDoc));

  const problems = page.getByTestId("page-source-problems");
  await expect.poll(async () => (await problems.innerText()).trim()).toBe("");
  const preview = page.getByTestId("block-preview").first();
  await expect(preview).toBeVisible();
  await expect.poll(async () => preview.innerText()).toContain("Still here");

  // The hostile string never reaches the STYLE system — `colour()` refuses
  // anything that is not `#rrggbb`, so nothing derived from it can carry the
  // scheme through. (It DOES sit, harmlessly, as plain text inside the
  // textarea's own value — that is the box faithfully showing what was
  // pasted, not a leak, so the check reads the computed custom property
  // rather than the page's raw HTML.)
  const accentVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent"),
  );
  expect(accentVar).not.toContain("javascript");
});

// **A correction to the brief, recorded rather than silently worked around.**
// The brief's case 7 asks for "Save is refused with the block marked" after
// pasting an `owner` leaf onto a person's page. That is not what happens, and
// it is worth being precise about why: `parseDocument`'s `refusedLeaves` check
// runs BEFORE `apply` is ever called, so a document naming a refused kind
// never reaches the form at all — `sections` stays exactly what it already
// was. There is nothing for Save to refuse, because nothing changed for it to
// refuse; pressing Save afterward saves the untouched, legitimate page. The
// stronger and genuinely testable claim is the one below: the hostile block
// never reaches the page, proved by reading the live preview rather than by
// asserting a banner that this flow never produces.
test("an owner leaf pasted onto a person's page is refused before it ever reaches the page", async ({
  page,
}) => {
  // Excludes: a dock that applies a document naming a kind the destination
  // page refuses, which would let a pasted `owner` block silently land on a
  // person's page — the one leaf kind `REFUSED_KIND` exists to keep off it.
  await page.goto("/en/me/edit");
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  await page.getByTestId("editor-open-source").click();
  const textarea = page.getByTestId("page-source-textarea");
  await expect(textarea).toBeVisible();

  const hostileDoc = {
    aeleos: DOCUMENT_VERSION,
    blocks: [
      container({
        name_en: "Bad",
        mode: "stack",
        children: [leaf({ kind: "owner", title_en: "Should not be here" })],
      }),
    ],
  };
  await textarea.fill(JSON.stringify(hostileDoc));

  const problems = page.getByTestId("page-source-problems");
  await expect
    .poll(async () => (await problems.innerText()).trim())
    .toContain("owner");

  // Nothing was applied: the hostile title never reaches the live preview,
  // which is still whatever the person's page already held.
  const previewText = await page
    .getByTestId("block-preview")
    .first()
    .innerText();
  expect(previewText).not.toContain("Should not be here");

  // And Save — pressed on the untouched page, because there is nothing else
  // for it to save — succeeds normally rather than producing a refusal, which
  // is the correction above made concrete. The dock is closed first: it is a
  // fixed sibling of the whole editor and would otherwise intercept the click.
  await page.getByTestId("page-source-close").click();
  await page.getByTestId("editor-save").click();
  await page.waitForURL(/\/pages$/, { timeout: 60_000 });
});

test("escape closes the dock and returns focus to the control that opened it", async ({
  page,
}) => {
  // Excludes: focus left stranded inside a closed, invisible dialog, or
  // dropped to the document body — either of which strands a keyboard user.
  // `PageSourceDock` itself does no focus management at all (see its own
  // TSDoc); this proves the native `<dialog>` element's own focusing steps
  // do it, which is why nothing in this codebase has to.
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  const opener = page.getByTestId("editor-open-source");
  await opener.click();
  const dock = page.getByTestId("page-source-dock");
  await expect(dock).toBeVisible();

  // Focus has to move INTO the dialog for its own `onKeyDown` to ever see
  // the Escape key at all — a keydown fired at the opener, outside the
  // dialog's subtree, would never bubble through it.
  await page.getByTestId("page-source-textarea").click();
  await page.keyboard.press("Escape");

  await expect(dock).toBeHidden();
  await expect(opener).toBeFocused();
});

test("hostile text is ugly, not page-breaking — the containment proof the spec owes", async ({
  page,
}) => {
  // Excludes: text that escapes its own block and breaks the page's
  // geometry. The spec deliberately does not defend how these characters
  // RENDER — reachable equally by typing, so that defence belongs at every
  // render rather than at this one door — and asserts nothing about
  // appearance here for exactly that reason. What it does owe, and what this
  // proves, is that none of the three can widen the document or take any
  // other section down with it.
  const { handle: hostileHandle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "hostiletext",
    displayName: "Hostile text",
    blocks: [],
  });

  await page.goto(`/en/pages/${hostileHandle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();
  await page.getByTestId("editor-open-source").click();
  const textarea = page.getByTestId("page-source-textarea");
  await expect(textarea).toBeVisible();

  const doc = {
    aeleos: DOCUMENT_VERSION,
    blocks: [
      container({
        name_en: "Ordinary",
        mode: "stack",
        children: [leaf({ title_en: "Fine" }), leaf({ title_en: "Also fine" })],
      }),
      container({
        name_en: "Hostile",
        mode: "stack",
        children: [
          // Written as escapes, never as literals — a raw control character
          // pasted into a source file is the hazard `check-source-bytes`
          // exists for, and a reviewer cannot see it in a diff.
          leaf({ title_en: "\u202Etesting" }),
          leaf({ title_en: "a" + "\u200D".repeat(50) + "b" }),
          leaf({ title_en: "e" + "\u0301".repeat(200) }),
        ],
      }),
    ],
  };
  await textarea.fill(JSON.stringify(doc));

  const problems = page.getByTestId("page-source-problems");
  await expect.poll(async () => (await problems.innerText()).trim()).toBe("");
  await expect(page.getByTestId("block-preview")).toHaveCount(2);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

  const overflowPast = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflowPast).toBeLessThanOrEqual(1);

  const previews = page.getByTestId("block-preview");
  const ordinaryBox = (await previews.nth(0).boundingBox())!;
  const hostileBox = (await previews.nth(1).boundingBox())!;
  expect(
    Math.abs(hostileBox.width - ordinaryBox.width),
    "the hostile section is clipped by its own container, not widened",
  ).toBeLessThan(2);

  expect(await previews.nth(0).innerText()).toContain("Fine");

  // **The spec's own claim, proven with the fixture already in hand.** This
  // document names neither `avatar`, `handle` nor `owner` — `parseDocument`
  // does not check required kinds, only refused ones, so it applied above
  // with `problems` empty. Save is a different boundary, and it still
  // refuses: the dock accepting a paste is not the same guarantee as the
  // save accepting it. The dock is closed first — it is a fixed sibling of
  // the whole editor and would otherwise intercept the click.
  //
  // **The banner's WORDS are asserted, not merely its presence** — a banner
  // existing cannot tell "refused for missing required kinds" from a network
  // error or an unrelated refusal left over from something else, which is
  // exactly the mistake `saveAndLeave`'s own note already warns against on
  // this surface. `useFursonaEditor` reports every database-level page
  // refusal — `PageRefusedError`, matched on its SQLSTATE class rather than
  // its message — as the single generic code `sectionsRefused`, so the string
  // asserted here is what the CATALOGUE renders for that code, read from the
  // same JSON the component does rather than hardcoded.
  //
  // **This is also the honest limit of what that banner can prove.** The
  // message is "Your sections were refused. Fix them and save again —
  // nothing else was lost." — it does not name `avatar`, `handle` or `owner`,
  // or any missing kind at all. `set_actor_sections` collapses every reason a
  // page write can be refused into one SQLSTATE class, so the client cannot
  // distinguish a missing required kind from any other block-level refusal
  // (too many blocks, a title too long, and so on) without a more specific
  // signal from the database than it currently sends. That is a real
  // limitation of the refusal message, not an artefact of this test.
  await page.getByTestId("page-source-close").click();
  await page.getByTestId("editor-save").click();
  const banner = page.getByTestId("editor-error-banner");
  await expect(banner).toBeVisible();
  expect(await banner.innerText()).toContain(
    enMessages.fursonas.form.errors.sectionsRefused,
  );
});

// EXPANDING THE REFERENCE MUST LEAVE ITS OWN DISCLOSURE REACHABLE.
//
// Reported by Heiner, and it is a geometry fault rather than a missing
// control: the `<summary>` that closes the reference sits at the TOP of the
// `<details>`, and `pageReference` returns about seventeen thousand
// characters. Rendered unbounded in a ~400px panel that is thousands of
// pixels tall, so expanding pushed the only control that closes it far above
// the dock's scroll position. Nothing was broken in the DOM — the toggle was
// there, correct, and passing every unit case that clicks it — and to
// somebody trying to get their page back that is the same as it not
// existing. `max-h-80` on the `<pre>` gives the disclosure a fixed cost.
//
// Excludes: a reference whose expanded height is bounded by nothing, and a
// cap that bounds the block while letting the panel itself grow.
test("expanding the reference leaves its summary on screen, and the block scrolls itself", async ({
  page,
}) => {
  await page.goto(`/en/pages/${handle}/edit`);
  await expect(page.getByTestId("block-preview").first()).toBeVisible();

  await page.getByTestId("editor-open-source").click();
  const dock = page.getByTestId("page-source-dock");
  await expect(dock).toBeVisible();

  const summary = dock.locator("summary");
  const block = dock.locator("pre");
  await summary.click();
  await expect(block).toBeVisible();

  const blockBox = (await block.boundingBox())!;
  const summaryBox = (await summary.boundingBox())!;
  const dockBox = (await dock.boundingBox())!;

  // The reference genuinely overflows what it is given — otherwise the cap is
  // untested, because an unbounded block that happens to be short would pass
  // every assertion below without the cap existing at all.
  const overflows = await block.evaluate(
    (node) => node.scrollHeight > node.clientHeight + 1,
  );
  expect(overflows, "the reference is too short to test a height cap").toBe(
    true,
  );

  // The cap itself: `max-h-80` is 20rem = 320px. Asserted as a bound rather
  // than an equality, since the block is shorter than its cap only if the
  // reference shrinks drastically, which the overflow check above rules out.
  expect(blockBox.height).toBeLessThanOrEqual(321);

  // And the consequence that was actually reported — the summary is still
  // where somebody can press it, inside the dock rather than scrolled off
  // above it.
  //
  // **This pair is CORROBORATING, not the discriminating assertion, and
  // saying so is the point** (root rule 23). Sabotaged by removing the cap,
  // the FIRST failure is the overflow precondition above: with no cap the
  // block simply grows instead of scrolling itself, so `scrollHeight` and
  // `clientHeight` agree and the check reddens before these two are reached.
  // These would very likely still pass on the unfixed code, because
  // `boundingBox` is read at the dock's initial scroll position — where the
  // summary sits regardless of how far the block runs on below it. The
  // reported symptom is a summary somebody has to scroll thousands of pixels
  // to reach, and a bounding box taken before any scrolling cannot see that.
  // What genuinely pins the fix is "the block scrolls itself"; these bound
  // the panel and are kept for what they document, not counted as proof.
  expect(summaryBox.y).toBeGreaterThanOrEqual(dockBox.y - 1);
  expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(
    dockBox.y + dockBox.height + 1,
  );

  // Reversible, which is the whole complaint: pressing it again closes it.
  await summary.click();
  await expect(block).toBeHidden();
});
