import type { Locator, Page } from "@playwright/test";

// ONE MACROTASK, WRITTEN DOWN ONCE, BECAUSE PASTING IT THREE TIMES IS HOW THIS
// RECURS.
//
// The yield below is a fix for a real lost key rather than a sleep, and it was
// first written inline in `block-drag.spec.ts` — where it stayed, while the two
// specs the same phase ported kept the unprotected lift. That is the shape this
// repository keeps paying for: a mechanism diagnosed in one place and applied
// in one place. Every keyboard lift in the suite goes through here now, so the
// next spec that needs one cannot forget the half that makes it reliable.

/**
 * Focuses a grip, lifts it with the space bar, and waits out the sensor's own
 * attach window.
 *
 * **The yield closes a window in which an arrow key reaches nothing at all.**
 * `KeyboardSensor.attach()` in `@dnd-kit/core@6.3.1` calls `handleStart()`
 * synchronously and then adds its own `keydown` listener inside a
 * `setTimeout` — so between the drag starting and that timer firing there is a
 * gap where a key press is silently dropped. The lift is OBSERVABLE inside
 * that gap, because the announcement is rendered from the state `handleStart`
 * set, which is exactly what made this a flake rather than a failure: one run
 * in three lost its first arrow and the walk then sat on its source place until
 * the poll timed out.
 *
 * It works by ORDERING and not by luck. The sensor's timer was queued before
 * this one and timers of equal delay fire in the order they were queued, so by
 * the time this resolves the listener is attached. A fixed wait would only have
 * made the window less likely.
 *
 * It asserts nothing about the lift itself: what "lifted" looks like differs
 * per spec — an empty live region for a first drag, a CHANGED one for a second
 * — and a helper that guessed would hand back the assertion-that-cannot-fail
 * this suite has already been bitten by once. Assert at the call site.
 *
 * @param page - the browser page.
 * @param grip - the grip to lift.
 * @returns nothing; resolves once an arrow key would be heard.
 */
export async function liftByKeyboard(page: Page, grip: Locator): Promise<void> {
  await grip.focus();
  await page.keyboard.press("Space");
  await page.evaluate(() => new Promise((done) => setTimeout(done)));
}
