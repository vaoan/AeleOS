import { expect, type Page } from "@playwright/test";

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
  await expect(page.getByTestId("editor-handle")).toBeVisible();
  await page.getByTestId("editor-handle").fill(handle);
  await page.getByTestId("editor-display-name").fill(displayName);
  await page.getByTestId("editor-visibility").selectOption("public");
}

/**
 * Opens the page inspector on Add, where new sections are offered.
 *
 * Idempotent: if Add is already showing, it does nothing; if another inspector
 * pane is showing, it changes only the tab.
 *
 * @param page - the editor page.
 */
export async function openPageAdd(page: Page): Promise<void> {
  if (await page.getByTestId("add-section").isVisible()) return;
  await openInspector(page);
  await page.getByTestId("inspector-tab-add").click();
  await expect(page.getByTestId("add-section")).toBeVisible();
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
 * Opens Page → Add, sets how many places a newly added section will lay
 * across, and waits until that choice is the select's value.
 *
 * **Retries the assignment, because a single `selectOption` can land on a
 * mount React then throws away.** `BlockEditor` keeps this count in
 * `useState`. CI's e2e job runs `next dev`, which Strict-Mode remounts the
 * editor once; a change that fires on the first mount is reset to the default
 * of two by the second. `border-style-cascade.spec.ts` then waited five
 * seconds for `"1"` on a control that would never move. Polling until the
 * value sticks is what makes the surviving mount the one that is set.
 * {@link openInspector} makes the path safe at phone widths where an existing
 * bottom sheet covers the Page control that originally opened it.
 *
 * @param page - the editor page.
 * @param spaces - the option value, as the select stores it.
 */
export async function chooseNewSectionSpaces(
  page: Page,
  spaces: string,
): Promise<void> {
  await openInspector(page);
  await page.getByTestId("inspector-tab-add").click();
  const select = page.getByTestId("new-section-spaces");
  await expect(select).toBeVisible();
  await expect
    .poll(async () => {
      await select.selectOption(spaces);
      return select.inputValue();
    })
    .toBe(spaces);
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
