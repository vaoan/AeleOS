import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Prepares Clerk before any end-to-end test runs.
 *
 * `clerkSetup` resolves the instance's Frontend API URL and obtains a testing
 * token, which is what lets an automated browser sign in at all: a development
 * instance applies bot protection to sign-in attempts, and Playwright looks
 * exactly like a bot.
 *
 * **It is skipped when there is no key, and that must stay true.** The anonymous
 * suites — the sign-in gate, the picker's signed-out leg, the public pages —
 * are the majority here and need no Clerk credentials at all. Demanding them
 * would turn a clean run into a hard failure on a fork, where secrets are
 * withheld, and on any machine that has not synced `.secrets`.
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY) return;
  await clerkSetup();
}
