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
 * Fills the four fields a new public fursona needs.
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
  await page.getByTestId("editor-handle").fill(handle);
  await page.getByTestId("editor-display-name").fill(displayName);
  await page.getByTestId("editor-visibility").selectOption("public");
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
  await expect(banner).toHaveCount(0);
  await page.waitForURL(/\/pages$/, { timeout: 60_000 });
}
