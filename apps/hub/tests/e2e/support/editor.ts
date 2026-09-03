import { expect, type Locator, type Page } from "@playwright/test";

// THE STEPS EVERY EDITOR SPEC REPEATS, AND WHY THEY LIVE TOGETHER.
//
// Two suites drive the real editor: `editor-saves-page.spec.ts`, which proves
// every template survives a save, and `nested-page-build.spec.ts`, which builds
// a nested page by hand. Both have to reach the editor, both have to press
// Save, and both have to invent a handle nothing else in the run can collide
// with — and `saveAndLeave` in particular carries a piece of hard-won
// diagnostic ordering that must not be re-derived independently in each file.

/**
 * A handle nothing else in the suite can collide with.
 *
 * @param prefix - names the test that made it, so a leftover row is traceable.
 * @returns the handle.
 */
export const handleFor = (prefix: string): string =>
  `${prefix}${Date.now().toString().slice(-9)}`;

/**
 * Opens the new-page editor through its Page selection, then fills the four
 * fields a public fursona needs. It asks {@link openInspector} to preserve an
 * already-open phone sheet rather than pressing a Page control underneath it.
 * The explicit breadcrumb and Options presses mirror the recursive
 * inspector's deselected startup instead of depending on page fields mounting
 * eagerly.
 *
 * @param page - the browser page.
 * @param handle - the fursona's handle.
 * @param displayName - what to show.
 */
export async function startFursona(
  page: Page,
  handle: string,
  displayName: string,
): Promise<void> {
  await page.goto("/es/pages/new");
  await openInspector(page);
  await page.getByTestId("inspector-breadcrumb").first().click();
  await page.getByTestId("inspector-tab-options").click();
  await expect(page.getByTestId("editor-handle")).toBeVisible();
  await page.getByTestId("editor-handle").fill(handle);
  await page.getByTestId("editor-display-name").fill(displayName);
  await page.getByTestId("editor-visibility").selectOption("public");
}

/**
 * Opens the page inspector on Items, where the page-level Add picker and the
 * brand presets live.
 *
 * Idempotent: if Items is already showing, it does nothing; if another inspector
 * pane is showing, it changes only the tab.
 *
 * **Checks `section-presets`, not `add-block` (2026-09-02).** `add-block` is
 * the same test id at every scope that offers one — a container's own
 * footer and every empty place carry it too — so it cannot tell "Page Items
 * is open" from "some OTHER scope's Items is open, and it also has an Add
 * control." `section-presets` renders only from the page-level palette.
 *
 * @param page - the editor page.
 */
export async function openPageAdd(page: Page): Promise<void> {
  if (await page.getByTestId("section-presets").isVisible()) return;
  await openInspector(page);
  await page.getByTestId("inspector-breadcrumb").first().click();
  await page.getByTestId("inspector-tab-items").click();
  await expect(page.getByTestId("section-presets")).toBeVisible();
}

/**
 * Opens the Add picker nearest `scope`, chooses one option, and waits for the
 * dialog to close.
 *
 * **One control adds, at every scope that can hold a block** — the page, a
 * container's own Items footer, or one empty place — so this is the single
 * helper every e2e spec drives it through. `scope` is a `Page` for the page
 * palette or a container's footer once that scope's Items pane is showing,
 * or a `Locator` (an `inspector-empty-place` row, most often) to disambiguate
 * one specific empty place among several. The dialog is not portalled — it
 * renders as a sibling of the trigger it opened from — so `scope`'s own
 * `getByTestId` finds it either way.
 *
 * @param scope - the page, or a locator scoping which `add-block` trigger.
 * @param choice - a content kind (`data-add-kind`) or a layout mode
 *   (`data-add-mode`), exactly as the picker's own options carry them.
 */
export async function addBlock(
  scope: Page | Locator,
  choice: { kind: string } | { mode: string },
): Promise<void> {
  await scope.getByTestId("add-block").click();
  const dialog = scope.getByTestId("add-block-picker");
  await expect(dialog).toBeVisible();
  const option =
    "kind" in choice
      ? dialog.locator(`[data-add-kind="${choice.kind}"]`)
      : dialog.locator(`[data-add-mode="${choice.mode}"]`);
  await option.click();
  await expect(dialog).toBeHidden();
}

/**
 * Adds a new top-level section from the page-level Add picker, in `grid`
 * mode, then sets its own width through its Options pane.
 *
 * **The width moved from before adding to after (2026-09-02)**, matching how
 * nesting already worked: the picker's layout options all add
 * `newContainer(mode, 2)`, a fixed starting shape, and a section's own
 * `section-spaces` control is what reshapes it afterwards. Leaves the new
 * section selected on Options — where `section-name` and every other field
 * a caller reaches for next already live — exactly as `add-section` used to.
 *
 * @param page - the editor page.
 * @param spaces - how many places across, as the select stores it.
 */
export async function addSection(page: Page, spaces: string): Promise<void> {
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
  await page.getByTestId("inspector-tab-options").click();
  const select = page.getByTestId("section-spaces");
  await expect(select).toBeVisible();
  // **Retries the assignment**, for the same reason `chooseNewSectionSpaces`
  // used to: CI's e2e job runs `next dev`, whose Strict Mode can remount the
  // editor once, and a change landing on a mount that gets thrown away is
  // reset to whatever the surviving mount started with. Polling until the
  // value sticks is what makes the surviving mount the one that is set.
  await expect
    .poll(async () => {
      await select.selectOption(spaces);
      return select.inputValue();
    })
    .toBe(spaces);
}

/**
 * Opens Page → Options, where the identity fields and the theme panel live.
 *
 * **The page's own fields are no longer mounted by simply loading the
 * editor.** The recursive inspector starts deselected, so `editor-handle`,
 * `editor-display-name`, `editor-visibility` and `theme-open` exist only once
 * the page itself is the selected target and Options is the showing pane. A
 * spec that reaches for one of those without this helper waits on an element
 * nothing is rendering, and reports a timeout naming the field rather than the
 * selection it was missing.
 *
 * Idempotent in the same way {@link openPageAdd} is: it presses Page only when
 * the inspector is closed, then names the page breadcrumb so a selection left
 * deeper in the tree by an earlier step cannot decide which Options open.
 *
 * @param page - the editor page.
 */
export async function openPageOptions(page: Page): Promise<void> {
  await openInspector(page);
  await page.getByTestId("inspector-breadcrumb").first().click();
  await page.getByTestId("inspector-tab-options").click();
  await expect(page.getByTestId("theme-open")).toBeVisible();
}

/**
 * Makes sure the inspector is showing, without pressing Page needlessly.
 *
 * **Pressing Page when the inspector is already open is not a no-op on a
 * phone**, which is why this asks first. The inspector is a bottom sheet
 * below `md`, `fixed` and up to `70vh` tall, so it covers the editor's own
 * control row once the page is scrolled at all — measured at portrait 320,
 * where `editor-identity-fields` inside the sheet intercepted every click
 * aimed at `select-page` until the test timed out. The sheet is already
 * open in that state, so there was nothing the press had to achieve.
 *
 * @param page - the editor page.
 */
export async function openInspector(page: Page): Promise<void> {
  const inspector = page.getByTestId("canvas-inspector");
  if (await inspector.isVisible()) return;
  await page.getByTestId("select-page").click();
  await expect(inspector).toBeVisible();
}

/**
 * Presses Save and waits for the editor to leave.
 *
 * **The banner is asserted before the navigation is waited for**, and the
 * order is the whole value of this helper. A refused save simply stays on the
 * page, so `waitForURL` alone reports a timeout naming nothing —
 * which is precisely how a suite can be red for a week without anybody
 * learning what refused it. Reading the banner first turns the same failure
 * into the message the person actually saw.
 *
 * **It reads the banner's WORDS, and for a while it only counted them.**
 * `toHaveCount(0)` reports "expected 0, received 1" about a refusal whose
 * entire value is the sentence it is showing, which left this helper one step
 * short of the diagnosis the paragraph above promises.
 *
 * @param page - the browser page, sitting on an editor.
 */
export async function saveAndLeave(page: Page): Promise<void> {
  await page.getByTestId("editor-save").click();
  const banner = page.getByTestId("editor-error-banner");
  await expect
    .poll(
      async () =>
        (await banner.count()) > 0 ||
        /\/pages$/.test(new URL(page.url()).pathname),
      { timeout: 60_000 },
    )
    .toBe(true);
  // **The banner's WORDS, not its count.** `toHaveCount(0)` reports
  // "expected 0, received 1" about a refusal whose whole value is the sentence
  // it is showing — which left this helper one step short of the diagnosis its
  // own note above promises. Reading the text first is what makes a refused
  // save name itself.
  const said = (await banner.count())
    ? (await banner.first().innerText()).trim()
    : "";
  expect(said, "the editor refused the save").toBe("");
  await page.waitForURL(/\/pages$/, { timeout: 60_000 });
}

/**
 * Proves that `page.getByTestId(id).last()` — the locator every `.last()`
 * call on a style-popup trigger in this suite trusts — currently resolves to
 * a CONTAINER's own trigger rather than a leaf's, and asserts, rather than
 * assuming it.
 *
 * **Why this needed proving at all.** `SectionStylePopup` mounts from both
 * `block-card.tsx` (a container) and `leaf-editor.tsx` (a leaf) now, and a
 * leaf's trigger renders inside its enclosing section's places — after that
 * section's own header, in DOM order. A page-wide `.last()` written when
 * only containers could answer this query silently started reaching a
 * leaf's trigger instead the moment a section grew one, in two specs that
 * predate this helper. The two ids are distinct now
 * (`SectionStylePopupProps.triggerTestId`: a container's stays
 * `section-style-open`, a leaf's is `leaf-style-open`), which makes the
 * failure this guards against impossible by construction rather than merely
 * unlikely — but the callers that survived the ambiguity by luck (an empty
 * place, a collapsed section) are worth pinning explicitly rather than left
 * to the id split alone to explain.
 *
 * **Only ONE of its callers can actually fail, and that was measured rather
 * than assumed (2026-08-30).** A review reverted the id split with every
 * call site left in place and found all nine passing — because collapsing a
 * section unmounts the whole places subtree, leaf and trigger included,
 * independent of whether the two ids collide, and every OTHER call site
 * collapses (or adds no content at all) before reaching this assertion. The
 * one exception is `border-style-cascade.spec.ts`'s second test, which adds
 * content and never collapses; reverting the split there reddens this
 * assertion, sabotage-verified. Calling it at the remaining sites is
 * documentation of a real, checked fact — corroborating rather than
 * discriminating, in root rule 23's terms — and is kept for that reason,
 * not represented as a second proof.
 *
 * @param page - the editor page.
 * @param id - the trigger's own test id — `section-style-open` for a
 *   container, `leaf-style-open` for a leaf.
 */
export async function assertLastTriggerIsAContainers(
  page: Page,
  id: string,
): Promise<void> {
  const trigger = page.getByTestId(id).last();
  const insideContainerHeader = await trigger.evaluate(
    (el) =>
      el.closest(
        '[data-testid="section-header"], [data-testid="nested-header"]',
      ) != null,
  );
  expect(
    insideContainerHeader,
    `the last '${id}' trigger sits inside a container's own header, not a leaf's`,
  ).toBe(true);
}
