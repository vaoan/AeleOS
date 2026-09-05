import { expect, type Page } from "@playwright/test";

// THE STEPS EVERY EDITOR SPEC REPEATS, AND WHY THEY LIVE TOGETHER.
//
// Two suites drive the real editor: `editor-saves-page.spec.ts`, which proves
// every template survives a save, and `nested-page-build.spec.ts`, which builds
// a nested page by hand. Both have to reach the editor, both have to press
// Save, and both have to invent a handle nothing else in the run can collide
// with — and `saveAndLeave` in particular carries a piece of hard-won
// diagnostic ordering that must not be re-derived independently in each file.
//
// **Rewritten for the Properties panel (2026-09-04).** The recursive
// Items/Options inspector is gone — `presentation/canvas-inspector.tsx` and
// `presentation/inspector-items.tsx` were deleted along with it. There is no
// tree navigation, no breadcrumb, no Back, and no per-place "empty place" row
// to address individually: a block is selected by clicking its own rendered
// element on the canvas (which carries `data-block-path`, hyphen-joined —
// `0`, `0-1`, `0-1-2`), or the page itself through `select-page`. The panel
// that opens for a selection always has exactly two tabs, `panel-tab-primary`
// and `panel-tab-secondary`, whose meaning depends on the selection kind:
// Page/Theme, Layout/Appearance, or Content/Appearance. See
// `apps/hub/src/features/actors/CLAUDE.md`'s "The Properties panel replaces
// the recursive inspector" section for the full account.

/**
 * A handle nothing else in the suite can collide with.
 *
 * @param prefix - names the test that made it, so a leftover row is traceable.
 * @returns the handle.
 */
export const handleFor = (prefix: string): string =>
  `${prefix}${Date.now().toString().slice(-9)}`;

/**
 * Selects Page, whatever was selected before.
 *
 * **Closes the panel first when it is already open, rather than trying to
 * press the canvas's own `select-page` button underneath whatever is
 * showing.** That button rides inside the editor canvas, and the Properties
 * panel is a bottom sheet below `md` that covers the canvas outright — the
 * same phone-sheet hazard the old recursive inspector's `openInspector`
 * guarded against, met here on a button with no breadcrumb left inside the
 * panel to reach instead. `panel-close` is always reachable, being part of
 * the panel itself, so closing through it and then pressing `select-page` on
 * a bare canvas is correct at every viewport rather than only on desktop.
 *
 * @param page - the editor page.
 */
async function selectPage(page: Page): Promise<void> {
  const panel = page.getByTestId("properties-panel");
  if (await panel.isVisible()) {
    await page.getByTestId("panel-close").click();
    await expect(panel).toBeHidden();
  }
  await page.getByTestId("select-page").click();
  await expect(panel).toBeVisible();
}

/**
 * Opens the new-page editor through its Page selection, then fills the four
 * fields a public fursona needs.
 *
 * **No tab click is needed (2026-09-04).** `panelContentFor`'s Page branch
 * puts the identity fields (`editor-handle`, `editor-display-name`,
 * `editor-visibility`) on the PRIMARY tab, and `enterSelection` — which
 * `select-page`'s own click handler calls — always resets the panel to its
 * first tab. So selecting Page alone is enough; there is no Options tab to
 * find them on any more, and no breadcrumb standing between selecting Page
 * and reaching them.
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
  await selectPage(page);
  await expect(page.getByTestId("editor-handle")).toBeVisible();
  await page.getByTestId("editor-handle").fill(handle);
  await page.getByTestId("editor-display-name").fill(displayName);
  await page.getByTestId("editor-visibility").selectOption("public");
}

/**
 * Opens the page's own Add palette — the brand presets and the template
 * picker — which now lives on Page's PRIMARY tab alongside the identity
 * fields, rather than behind a dedicated Items pane.
 *
 * Idempotent: if the palette is already showing, it does nothing.
 *
 * **Still checks `section-presets`, not `add-block` (2026-09-02, unchanged
 * reasoning).** `add-block` is the single global Add trigger now — there is
 * only ever one on the page — but selecting it alone does not prove Page is
 * the current target, where `section-presets` renders only from the page's
 * own palette.
 *
 * @param page - the editor page.
 */
export async function openPageAdd(page: Page): Promise<void> {
  if (await page.getByTestId("section-presets").isVisible()) return;
  await selectPage(page);
  await expect(page.getByTestId("section-presets")).toBeVisible();
}

/**
 * Opens Page → the theme panel, which sits on the SECONDARY tab now.
 *
 * **This is a swap from before the Properties panel, not a renamed step.**
 * The old Items/Options split put the page's identity fields on Options and
 * the add palette on Items; the two-tab panel's Page pairing is Page/Theme,
 * with the identity fields and the add palette sharing the PRIMARY tab and
 * the theme panel alone on the SECONDARY one. A spec reaching for `theme-open`
 * without this helper waits on an element nothing is rendering while Page's
 * primary tab shows instead.
 *
 * @param page - the editor page.
 */
export async function openPageOptions(page: Page): Promise<void> {
  await selectPage(page);
  await page.getByTestId("panel-tab-secondary").click();
  await expect(page.getByTestId("theme-open")).toBeVisible();
}

/**
 * Selects a block by its canvas path and waits for the Properties panel to
 * show it.
 *
 * **The only way into a container or a leaf now.** There is no Items list to
 * drill through any more — `onCanvasClick` in `block-editor.tsx` resolves a
 * click to the nearest ancestor carrying `data-block-path` and selects it.
 * `path` is the hyphen-joined form the renderer itself emits (`formatBlockPath`
 * in `domain/editor-selection.ts`) — `"0"` for the first top-level section,
 * `"0-1"` for its second child, `"0-1-2"` three levels down.
 *
 * **Only a FILLED place carries `data-block-path` — an empty one does not.**
 * `blocks.tsx`'s `placeIn` renders an empty seat's own `<div>` with no
 * `data-block-path` at all (only the wrapping `data-canvas-path`, which
 * `onCanvasClick` never reads), so this cannot select an empty place; there is
 * no way to do that any more; see this module's own header comment.
 *
 * **Clicks near the element's own top-left corner, not its centre.** A
 * populated container's bounding box is mostly covered by its own children,
 * each carrying its OWN `data-block-path` — a centred click would very often
 * land inside one of them, and `closest()` would resolve to the CHILD rather
 * than the container this call asked for. The corner is the container's own
 * padding or heading, never a descendant's.
 *
 * @param page - the editor page.
 * @param path - the block's hyphen-joined path, e.g. `"0"` or `"0-1"`.
 */
export async function selectBlock(page: Page, path: string): Promise<void> {
  await page
    .locator(`[data-block-path="${path}"]`)
    .first()
    .click({ position: { x: 4, y: 4 } });
  await expect(
    page.getByTestId("properties-panel"),
    `selecting the block at "${path}" did not open the Properties panel`,
  ).toBeVisible();
}

/**
 * Opens the Add picker, chooses one option, and waits for the dialog to
 * close.
 *
 * **There is exactly one `add-block` trigger now, portalled into the editor
 * toolbar (2026-09-04)** — the page-level palette, a container's own Items
 * footer, and every empty place each used to mount their own; all three are
 * gone. Which block the choice lands beside is decided entirely by the
 * CURRENT SELECTION, through `domain/add-target.ts`'s `addTargetFor`: nothing
 * selected or Page selected targets the page root, a selected container
 * targets itself, and a selected leaf targets its own parent. So a caller
 * wanting to add inside a specific container selects that container (or one
 * of its own children) first, through {@link selectBlock}, rather than
 * passing a locator to this function — there is only ever one trigger to find.
 *
 * @param page - the editor page.
 * @param choice - a content kind (`data-add-kind`) or a layout mode
 *   (`data-add-mode`), exactly as the picker's own options carry them.
 */
export async function addBlock(
  page: Page,
  choice: { kind: string } | { mode: string },
): Promise<void> {
  await page.getByTestId("add-block").click();
  const dialog = page.getByTestId("add-block-picker");
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
 * mode, then sets its own width through its Layout tab.
 *
 * **No tab click is needed to reach `section-spaces` (2026-09-04).**
 * `addAt` (`block-editor.tsx`) selects whatever it just added and resets the
 * panel to its PRIMARY tab — which, for a freshly added container, is Layout:
 * `BlockCard` with the mode/spaces/weights controls, mounted alongside this
 * function's own polling target with no navigation in between.
 *
 * @param page - the editor page.
 * @param spaces - how many places across, as the select stores it.
 */
export async function addSection(page: Page, spaces: string): Promise<void> {
  await openPageAdd(page);
  await addBlock(page, { mode: "grid" });
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
 * Opens the Appearance tab for whatever is currently selected.
 *
 * **Replaces every "open the style popup" step this suite used to drive
 * through a trigger button (2026-09-04).** `SectionStylePopup`'s own trigger
 * (`section-style-open`/`leaf-style-open`) is suppressed everywhere the
 * Properties panel mounts `BlockCard`/`LeafEditor` (`hideStylePopup`) — the
 * panel's own Appearance tab renders the identical fields inline instead,
 * through `StyleFields`, with no popup, no backdrop and no dialog element to
 * open at all. Every `section-style-*` field id is unchanged, since
 * `StyleFields` renders the same `StylePopupFields` the old popup did; only
 * the entry point moved from a trigger click to a tab click.
 *
 * @param page - the editor page.
 */
export async function openStyleFields(page: Page): Promise<void> {
  await page.getByTestId("panel-tab-secondary").click();
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
