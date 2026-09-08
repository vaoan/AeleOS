import { deleteTestIdentity } from "./clerk-session";

const registry: string[] = [];

/**
 * Records a freshly created Clerk test user so the worker-scoped cleanup
 * fixture (`./auto-cleanup`) can delete it even when the spec that created it
 * never reaches its own teardown — a cancelled CI job, a crashed worker, or a
 * throw inside `beforeAll` all skip past an ordinary `afterAll`, and this
 * registry is what survives that.
 *
 * Called by `createTestIdentity` in `./clerk-session` immediately after Clerk
 * confirms the user exists, before anything later in that function gets a
 * chance to throw and leave the user unregistered.
 *
 * @param clerkUserId - the Clerk user id (`TestIdentity.userId`) to delete on
 *   drain.
 */
export function registerTestIdentity(clerkUserId: string): void {
  registry.push(clerkUserId);
}

/**
 * The Clerk user ids currently registered and not yet drained.
 *
 * @returns a read-only snapshot; mutating the array a caller already holds
 *   has no effect on the registry, since this returns the live array itself.
 */
export function listRegisteredTestIdentities(): readonly string[] {
  return registry;
}

/** Injectable seam for testing {@link drainTestIdentities} without Clerk. */
interface DrainOptions {
  /**
   * Deletes one Clerk test user. Defaults to the real `deleteTestIdentity`
   * from `./clerk-session`, which never throws.
   */
  deleter?: (clerkUserId: string) => Promise<void>;
}

/**
 * Deletes every registered Clerk test user and empties the registry.
 *
 * Never throws: a failed deletion is logged and the drain moves on to the
 * next entry, so one bad delete cannot strand the rest. The default deleter
 * already swallows its own failures, so in ordinary use this `try`/`catch`
 * exists for a caller-supplied `deleter` that does not.
 *
 * @param options - see {@link DrainOptions}.
 * @returns the number of identities the drain attempted to delete.
 */
export async function drainTestIdentities(
  options: DrainOptions = {},
): Promise<number> {
  const deleter = options.deleter ?? deleteTestIdentity;
  const pending = registry.splice(0, registry.length);

  for (const clerkUserId of pending) {
    try {
      await deleter(clerkUserId);
    } catch (error) {
      console.warn(`[e2e] drain failed for ${clerkUserId}:`, error);
    }
  }

  return pending.length;
}
