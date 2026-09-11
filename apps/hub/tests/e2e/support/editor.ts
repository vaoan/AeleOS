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
 * **Closes the panel first when a selection is already showing**, rather
 * than trying to press the canvas's own `select-page` button underneath
 * whatever is showing. That button rides inside the editor canvas, and the
 * Properties panel is a bottom sheet below `md` that covers the canvas
 * outright — the same phone-sheet hazard the old recursive inspector's
 * `openInspector` guarded against, met here on a button with no breadcrumb
 * left inside the panel to reach instead.
 *
 * **Checks `panel-tab-primary`, not the panel's own visibility (2026-09-05).**
 * The panel renders unconditionally now, for its own persistent Palette
 * tab — see `properties-panel.tsx`'s own TSDoc — so it is never hidden by
 * selection state, only its two selection-dependent tab buttons are.
 * `panel-close` still clears the selection; what proves that now is
 * `panel-tab-primary` going `hidden`, not the panel disappearing.
 *
 * @param page - the editor page.
 */
export async function selectPage(page: Page): Promise<void> {
  const panel = page.getByTestId("properties-panel");
  const primaryTab = page.getByTestId("panel-tab-primary");
  if (await primaryTab.isVisible()) {
    await page.getByTestId("panel-close").click();
    await expect(primaryTab).toBeHidden();
  }
  await page.getByTestId("select-page").click();
  await expect(panel).toBeVisible();
  await expect(primaryTab).toBeVisible();
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
 * Opens the page's own brand-preset and template-picker controls, which
 * live on Page's PRIMARY tab alongside the identity fields, rather than
 * behind a dedicated Items pane.
 *
 * Idempotent: if the presets are already showing, it does nothing.
 *
 * **Unrelated to adding a block (2026-09-06).** Naming this `openPageAdd`
 * predates the persistent Palette tab and reads as if it opened an add
 * control — it opens Page's own PRIMARY tab, where `section-presets`
 * (whole-page templates, not a single block) happens to live. Adding a
 * single block is {@link addBlock}'s job now, and neither function calls
 * the other.
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
 * **Closes an already-open selection first, exactly as {@link selectPage}
 * does — checking `panel-tab-primary`, not the panel's own visibility, for
 * the same reason (2026-09-05): the panel itself renders unconditionally
 * now.** Below `md` the panel is a bottom sheet that can cover the canvas
 * outright — `selectPage`'s own TSDoc carries the measurement — and the
 * block this selects lives in that same canvas. A selection already open
 * when this is called would otherwise leave the sheet sitting over the very
 * element the click is aimed at, on a phone-width viewport.
 *
 * **Waits for the canvas's own panel-accommodation transition to settle
 * before returning ({@link waitForCanvasAccommodation}).** A caller reading
 * a block's geometry (a grip's `boundingBox()`, for a drag) immediately
 * after this resolves would otherwise race `block-editor.tsx`'s 210ms
 * `padding-right` transition — the canvas's grid columns are laid out
 * against whatever width the padding has reached at that instant, so a
 * coordinate captured mid-transition can land on the wrong sibling once the
 * layout finishes settling a moment later.
 *
 * @param page - the editor page.
 * @param path - the block's hyphen-joined path, e.g. `"0"` or `"0-1"`.
 */
export async function selectBlock(page: Page, path: string): Promise<void> {
  const panel = page.getByTestId("properties-panel");
  const primaryTab = page.getByTestId("panel-tab-primary");
  if (await primaryTab.isVisible()) {
    await page.getByTestId("panel-close").click();
    await expect(primaryTab).toBeHidden();
  }
  await page
    .locator(`[data-block-path="${path}"]`)
    .first()
    .click({ position: { x: 4, y: 4 } });
  await expect(
    panel,
    `selecting the block at "${path}" did not open the Properties panel`,
  ).toBeVisible();
  await waitForCanvasAccommodation(page);
}

/**
 * Waits for `[data-editor-stack]`'s own `padding-right` transition
 * (`block-editor.tsx`, 210ms) to finish accommodating the Properties panel.
 *
 * **Every geometry read taken right after a selection races this
 * transition, and the race is real rather than theoretical.** The canvas's
 * grid columns are laid out against whatever width `padding-right` has
 * reached at the instant something calls `boundingBox()`, so a coordinate
 * captured mid-transition can land a click on the wrong sibling once the
 * layout finishes settling a moment later — measured directly: the same
 * click that resolves to the correct grip once this settles resolves to the
 * NEIGHBOURING place, or to the section itself, while the padding is still
 * animating. This mirrors `editor-bars-stay-pinned.spec.ts`'s own fix for
 * the identical shape (the room a Save banner needs from the panel), and
 * for the same reason: the wait states the RELATIONSHIP — the pad equals the
 * panel's own width — rather than a copied pixel value, so it holds however
 * the two widths are computed.
 *
 * **Below `md` this is a no-op**, checked from the viewport's own width
 * rather than from the DOM: `md:pr-[...]` never applies there, so
 * `padding-right` reads `0px` from the instant the panel mounts rather than
 * animating toward it — reading that `0` as "settled" would resolve on
 * every poll immediately, including the very first one on a desktop
 * viewport before the transition has moved at all. The viewport width is
 * known synchronously and is not itself racing anything.
 *
 * @param page - the editor page.
 */
async function waitForCanvasAccommodation(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width < 768) return;
  const panel = page.getByTestId("properties-panel");
  await expect
    .poll(async () => {
      const [padRight, panelWidth] = await Promise.all([
        page
          .locator("section[data-editor-stack]")
          .evaluate((el) => getComputedStyle(el).paddingRight),
        panel.evaluate((el) => el.getBoundingClientRect().width),
      ]);
      return Math.round(parseFloat(padRight)) === Math.round(panelWidth)
        ? "settled"
        : `${padRight} vs ${panelWidth}`;
    })
    .toBe("settled");
}

/**
 * Drags a leaf kind or a container mode from the persistent Palette tab
 * onto an exact canvas position, by real pointer.
 *
 * **The one mechanism left for adding a block, since `AddBlockPicker`,
 * `add-target.ts` and `add-slot.tsx` are deleted (2026-09-06).** There is no
 * "current target" any selection implies any more — the palette is a drag
 * source reachable from anywhere, onto anywhere `insertTargetsFor`
 * (`domain/palette-targets.ts`) names as valid, so a caller states the exact
 * `data-canvas-path` to land on rather than relying on an implicit target
 * derived from selection.
 *
 * **This always GROWS the target by one, and never replaces an existing
 * empty place in place.** `onDragEnd`'s palette branch calls
 * `insertBlockAt`, whose only write is `insertAt` — a pure splice-insert
 * (`domain/block-edits.ts`) — so dropping onto an existing null inserts
 * BEFORE it rather than consuming it: the null survives, shifted one
 * position later. The deleted `AddBlockPicker` used a different mechanism
 * (`nextChildPosition`, now dead code with no live caller reaching it) that
 * genuinely replaced a container's first empty child in place with no
 * growth at all — a capability this palette-only mechanism does not have.
 * See {@link firstOpenPlace} for the closest available approximation, and
 * `apps/hub/src/features/actors/CLAUDE.md`'s account of Task 8 of the
 * palette drag-to-add feature for the full record of what this cost.
 *
 * Opens the Palette tab itself — it renders unconditionally and needs no
 * selection (`properties-panel.tsx`) — so no prior {@link selectBlock} is
 * needed before calling this.
 *
 * **The drop target's own geometry is read AFTER the lift, not before
 * (2026-09-06), and re-read a second time once the pointer has actually
 * reached it, not only before the lift.** The Palette tab's own scroll
 * position differs from the canvas's, and this is a general safety margin
 * against anything shifting between the lift and the final move — not,
 * any more, a fix for a specific known reflow; see the next paragraph.
 *
 * **The pointer moves onto the target BEFORE this function waits for a
 * mark to appear, not after (corrected 2026-09-11 — this used to be
 * backwards).** A palette-origin drag used to light up every valid
 * `insertTargets` entry at once, through `AppendSlot`'s own MEMBERSHIP
 * check — constant for the whole drag, independent of where the pointer
 * actually was — so waiting for `[data-canvas-drop="place"]` to appear
 * right after the lift, before the pointer ever left the palette thumbnail,
 * was a valid proxy for "the drag has started," and the growth that
 * highlight caused (`AppendSlot`'s own `min-h-12`, applied only while
 * marked) was real, in-flow reflow this function used to compensate for by
 * re-reading `targetCanvasPath`'s box afterward.
 *
 * Neither is true now. `AppendSlot` and `EditableBlockFrame` both draw the
 * single WINNING mark — the one `onDragOver` (`block-editor.tsx`) resolves
 * from the pointer's own real position, via `insertMarkFor`
 * (`domain/palette-targets.ts`) — so no mark exists anywhere on the page
 * until the pointer is actually over a valid landing; waiting for one
 * before moving there would wait forever. And the mark itself is an
 * absolutely positioned `DropMark`, out of flow by design, so THE WINNER
 * changing mid-drag never reflows the canvas any more, on any target — an
 * `AppendSlot` still reserves real height for every valid target ONCE, at
 * the drag's own start, and holds that reservation for the drag's whole
 * duration (task 4's own reinstated fix; the wrapper is not out of flow the
 * way the mark is) — see `apps/hub/src/features/actors/CLAUDE.md`'s
 * "drop-target-legibility" account. This function moves the pointer onto
 * `targetCanvasPath` first, THEN waits for whichever of
 * `canvas-drop-before`/`-after`/`-place` the drop answers, unscoped to any
 * one element: `insertMarkFor` marks an already-populated container's
 * trailing append slot by drawing `after` on its LAST CHILD, not on the
 * append slot's own element, so the mark a valid drop produces is not
 * always a descendant of `targetLocator` itself.
 *
 * @param page - the editor page.
 * @param choice - a content kind (`data-palette-kind`) or a layout mode
 *   (`data-palette-mode`), exactly as the palette's own thumbnails carry
 *   them.
 * @param targetCanvasPath - the exact `data-canvas-path` to drop onto — an
 *   existing place (empty or filled) or a container's own append slot, one
 *   past its last child, or `""` for the page root's own append slot when
 *   there is nothing at that exact top-level index yet.
 */
export async function dragPaletteOnto(
  page: Page,
  choice: { kind: string } | { mode: string },
  targetCanvasPath: string,
): Promise<void> {
  await page.getByTestId("panel-tab-palette").click();
  const thumbnail =
    "kind" in choice
      ? page.locator(`[data-palette-kind="${choice.kind}"]`)
      : page.locator(`[data-palette-mode="${choice.mode}"]`);
  await expect(thumbnail).toBeVisible();
  // **Both ends are scrolled into view before their geometry is read, and
  // this is load-bearing rather than tidy.** The Palette tab lists all
  // sixteen leaf kinds and eight container modes in one scrollable pane —
  // a container mode thumbnail sits well below the fold on an ordinary
  // viewport — and `boundingBox()` answers the element's LAID-OUT position
  // whether or not it is currently within the visible scrollport. Moving
  // the mouse to that position without scrolling first targets a point
  // outside the viewport the real browser never dispatches a pointer event
  // to, so the drag silently never begins — no error, no thrown assertion,
  // just a drop that lands nowhere. Confirmed by direct reproduction: the
  // identical drag against the identical target succeeds once each
  // locator is scrolled into view first and fails, silently, without it.
  const targetLocator = page.locator(
    `[data-canvas-path="${targetCanvasPath}"]`,
  );
  await thumbnail.scrollIntoViewIfNeeded();
  const source = await thumbnail.boundingBox();
  await targetLocator.scrollIntoViewIfNeeded();
  const target = await targetLocator.boundingBox();
  expect(
    source,
    `no palette thumbnail for ${JSON.stringify(choice)}`,
  ).not.toBeNull();
  expect(target, `no canvas position at "${targetCanvasPath}"`).not.toBeNull();
  // Clears `DRAG_THRESHOLD` (8px) before crossing to the target, matching
  // `palette-drag-to-add.spec.ts`'s own shape: a single big jump risks the
  // sensor never registering the intermediate move that proves a real drag —
  // rather than a click — is under way.
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source!.x + source!.width / 2 + 20,
    source!.y + source!.height / 2,
  );
  // **The target's box is re-read here, AFTER the threshold-crossing move,
  // rather than reused from before `mouse.down()` — a general safety
  // margin now, not a fix for a known reflow (corrected 2026-09-11).**
  // The WINNER changing mid-drag never reflows the canvas any more — see
  // this function's own header doc — but an `AppendSlot` target's own box
  // can still have grown once by this point, from its reservation: that
  // growth is published at `onDragStart`, which the threshold-crossing
  // move just above already triggered, so it has already landed by the
  // time this line runs. Re-reading here still costs nothing and still
  // protects only against something else on the page shifting between the
  // lift and this move.
  await targetLocator.scrollIntoViewIfNeeded();
  const settledTarget = await targetLocator.boundingBox();
  expect(
    settledTarget,
    `no canvas position at "${targetCanvasPath}" once the drag settled`,
  ).not.toBeNull();
  await page.mouse.move(
    settledTarget!.x + settledTarget!.width / 2,
    settledTarget!.y + settledTarget!.height / 2,
    { steps: 8 },
  );
  // **Waits for the drop's own mark to appear ONLY NOW, after the pointer
  // has actually reached the target — moved from before the move to after
  // it (corrected 2026-09-11; see this function's own header doc for why
  // the old order stopped working).** Unscoped to `targetLocator`, because
  // a valid drop's own mark is not always drawn as its descendant (see the
  // header doc's own account of an already-populated container's trailing
  // append slot). Root rule 26's own "wait for a CHANGE, not for presence"
  // still holds — this waits for the resolved drag's own mark to mount,
  // not merely for time to pass.
  await page
    .getByTestId(/^canvas-drop-/)
    .first()
    .waitFor();
  await page.mouse.up();
  // Past `@dnd-kit/core`'s own post-drop click-swallow window —
  // `PointerSensor.detach()` keeps a document-level capturing `click`
  // listener alive for exactly 50ms after a drop (root rule 41's measured
  // exemption class).
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see comment above.
    () => new Promise((done) => setTimeout(done, 100)),
  );
}

/**
 * Finds the first empty existing place inside a container, or its own
 * append slot when every place is filled or none exist yet.
 *
 * **The closest available approximation of the deleted `AddBlockPicker`'s
 * "always fills the parent's first empty place" contract — approximation,
 * not equivalence.** Landing a drop on the path this returns still GROWS
 * the container by one whenever the returned path names an existing null
 * (see {@link dragPaletteOnto}'s own account), so a page built through this
 * helper carries one extra empty place for every existing null it lands
 * ahead of — where the deleted mechanism carried none. What it preserves is
 * ORDER: content added through repeated calls lands at increasing indices,
 * the same left-to-right sequence the deleted mechanism produced, even
 * though the total count now differs.
 *
 * @param page - the editor page.
 * @param containerPath - the container's own hyphen-joined path, or `""`
 *   for the page root.
 * @returns the `data-canvas-path` to drop onto.
 */
async function firstOpenPlace(
  page: Page,
  containerPath: string,
): Promise<string> {
  const depth = containerPath === "" ? 1 : containerPath.split("-").length + 1;
  const prefix = containerPath === "" ? "" : `${containerPath}-`;
  const locator = prefix
    ? page.locator(`[data-canvas-path^="${prefix}"]`)
    : page.locator("[data-canvas-path]");
  const found = await locator.evaluateAll((elements, wantedDepth) => {
    type Candidate = { path: string; isAppend: boolean; hasBlock: boolean };
    const direct: Candidate[] = [];
    for (const element of elements) {
      const path = element.getAttribute("data-canvas-path");
      if (!path || path.split("-").length !== wantedDepth) continue;
      direct.push({
        path,
        isAppend: element.getAttribute("data-testid") === "canvas-append-slot",
        hasBlock:
          document.querySelector(`[data-block-path="${path}"]`) !== null,
      });
    }
    direct.sort(
      (a, b) =>
        Number(a.path.split("-").at(-1)) - Number(b.path.split("-").at(-1)),
    );
    const open = direct.find((entry) => !entry.isAppend && !entry.hasBlock);
    if (open) return open.path;
    const append = direct.find((entry) => entry.isAppend);
    return append ? append.path : null;
  }, depth);
  if (!found) {
    throw new Error(
      `no open place or append slot found under "${containerPath}"`,
    );
  }
  return found;
}

/**
 * Drags a leaf kind or a container mode onto the first open place inside a
 * container, through the persistent Palette tab.
 *
 * **Replaces the deleted `AddBlockPicker`'s single global Add
 * (2026-09-06).** That mechanism read the CURRENT SELECTION to decide where
 * a choice landed; this reads the container's own path instead, since the
 * palette implies no target of its own — a caller wanting to add beside
 * something already selected passes that block's own container path
 * directly, the same path {@link selectBlock} would have used to select it.
 *
 * @param page - the editor page.
 * @param choice - a content kind (`data-palette-kind`) or a layout mode
 *   (`data-palette-mode`).
 * @param containerPath - the container to add into — its own hyphen-joined
 *   path, or `""` for the page root.
 */
export async function addBlock(
  page: Page,
  choice: { kind: string } | { mode: string },
  containerPath: string,
): Promise<void> {
  const target = await firstOpenPlace(page, containerPath);
  await dragPaletteOnto(page, choice, target);
}

/**
 * Adds a new top-level section from the persistent Palette tab, in `grid`
 * mode, then sets its own width through its Layout tab.
 *
 * **Always lands at the page's own append slot (2026-09-06).** No top-level
 * entry is ever `null` — every one is a real section — so
 * {@link firstOpenPlace} for the page root always resolves to the append
 * slot, exactly as the deleted `AddBlockPicker`'s page-root add always did.
 *
 * **No tab click is needed to reach `section-spaces`.** A successful drop
 * selects what it just added and switches the panel to its PRIMARY tab —
 * which, for a freshly added container, is Layout: `BlockCard` with the
 * mode/spaces/weights controls, mounted alongside this function's own
 * polling target with no navigation in between.
 *
 * @param page - the editor page.
 * @param spaces - how many places across, as the select stores it.
 */
export async function addSection(page: Page, spaces: string): Promise<void> {
  await addBlock(page, { mode: "grid" }, "");
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
 * Opens the toolbar's "More" disclosure, if it is not already open.
 *
 * **Since 2026-09-04's "Group source JSON, Interact with page and Cancel
 * under More"**, the page-source trigger (`editor-open-source`), the
 * Interact-with-page switch (`interact-with-page`) and Cancel
 * (`editor-cancel`) all live inside a native `<details>`/`<summary>`
 * disclosure — `EditorToolbar` no longer renders any of the three as a
 * flat, always-visible button. A closed `<details>` hides its non-`summary`
 * children through the browser's own user-agent stylesheet, so a click
 * aimed at one of them times out as "not visible" until the disclosure is
 * opened first.
 *
 * Checks the `<details>` element's own `open` property rather than the
 * summary's visibility or a class, because that property is the single
 * source of truth the browser itself toggles — and checking it, rather
 * than clicking the summary unconditionally, is what keeps this callable
 * more than once in the same test without accidentally closing the
 * disclosure back up on a second call.
 *
 * @param page - the editor page.
 */
export async function openMore(page: Page): Promise<void> {
  const summary = page.getByTestId("editor-more");
  const isOpen = await summary.evaluate(
    (el) => (el.parentElement as HTMLDetailsElement).open,
  );
  if (!isOpen) {
    await summary.click();
  }
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
