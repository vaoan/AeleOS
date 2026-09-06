import { test as base } from "@playwright/test";

import { drainTestIdentities } from "./user-registry";

/**
 * `test`, extended with a worker-scoped, `auto: true` fixture that drains the
 * Clerk test-user registry when the worker shuts down.
 *
 * **This is what makes cleanup a mechanism rather than a convention.**
 * Playwright runs a worker fixture's teardown half even after a failed test,
 * a timeout, or a throw inside `beforeAll` — exactly the cases where an
 * ordinary `test.afterAll` calling `deleteTestIdentity` gets skipped and
 * leaves the Clerk user behind. A spec importing `test` from here instead of
 * `@playwright/test` cannot forget to clean up, because cleanup is no longer
 * its job: every `createTestIdentity` call already registered the user, and
 * this fixture deletes whatever is still registered once the worker is done
 * with it.
 */
export const test = base.extend<object, { cleanupTestIdentities: void }>({
  cleanupTestIdentities: [
    async (_fixtures, use) => {
      await use();
      const drained = await drainTestIdentities();
      if (drained > 0) {
        console.log(`[e2e] drained ${drained} Clerk test identity(ies)`);
      }
    },
    { scope: "worker", auto: true },
  ],
});

export { expect } from "@playwright/test";
