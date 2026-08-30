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
 * It works by ORDERING and not by luck — but **the ordering it needs is a
 * FRAME, and a bare macrotask was not enough.** This yielded a single
 * `setTimeout` until 2026-08-20, on the reasoning that the sensor's timer was
 * queued first and equal-delay timers fire in queue order. That reasoning has
 * a hole: it assumes the sensor has already ATTACHED when the yield is queued,
 * and attach happens in a React commit that the scheduler is free to defer.
 * On a heavier editor page it does defer, and then our timer is queued first
 * and fires first — so the window is still open and the first arrow is still
 * lost. Measured rather than argued: on a four-section page the first arrow
 * was lost on every run with one macrotask AND with two, and on none with the
 * yield below.
 *
 * `requestAnimationFrame` is what closes it, because React commits BEFORE
 * paint — so by the time the frame callback runs, the commit that attaches the
 * sensor has happened and its `setTimeout` is queued. The `setTimeout` nested
 * inside the frame is queued after that one and therefore fires after it. A
 * plain wait of 50ms also worked; this is the same guarantee without a number
 * to be wrong about on a slower machine.
 *
 * It asserts nothing about the lift itself: what "lifted" looks like differs
 * per spec — an empty live region for a first drag, a CHANGED one for a second
 * — and a helper that guessed would hand back the assertion-that-cannot-fail
 * this suite has already been bitten by once. Assert at the call site.
 *
 * **Carries a targeted `eslint-disable-next-line` for `no-restricted-syntax`
 * (2026-08-29).** That rule bans the hand-rolled `setTimeout`-wrapped-in-a-
 * `Promise` sleep everywhere else under `tests/e2e`, the same guess about
 * machine speed `playwright/no-wait-for-timeout` already forbids for
 * `page.waitForTimeout`, spelled by hand. This construction is exempt because
 * it is not a guess: see the measurements above.
 *
 * @param page - the browser page.
 * @param grip - the grip to lift.
 * @returns nothing; resolves once an arrow key would be heard.
 */
export async function liftByKeyboard(page: Page, grip: Locator): Promise<void> {
  await grip.focus();
  await page.keyboard.press("Space");
  // CLAUDE.md rule 26's ordering fix, not a guess about how slow a machine
  // is: a measured rAF-then-timer sequence that runs after dnd-kit's
  // KeyboardSensor has attached its own listener. One macrotask lost the
  // first arrow key on every run; this construction lost it on none. See the
  // TSDoc above.
  await page.evaluate(
    // eslint-disable-next-line no-restricted-syntax -- see the comment above.
    () => new Promise((done) => requestAnimationFrame(() => setTimeout(done))),
  );
}
