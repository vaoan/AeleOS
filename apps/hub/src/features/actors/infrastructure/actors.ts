import {
  ensurePersonActor as ensure,
  getPersonActor as read,
  type PersonActor,
} from "@aeleos/identity";
import { createServerClient } from "@/shared/infrastructure/supabase-server";

// **Type-only, and the `type` keyword is load-bearing.** `unicorn/prefer-export-from`
// rewrote this as `export { type PersonActor } from …`, which is a value-space
// re-export carrying a type modifier: TypeScript erases the name but still
// emits the re-export binding, so a runtime export appeared on a module that
// routes import through the feature barrel — and `next build` refused the
// whole app with "Invalid segment configuration export detected". A type-only
// re-export is erased entirely and satisfies the rule as well.
export type { PersonActor } from "@aeleos/identity";

/**
 * Ensures the signed-in person has an actor row, returning its `actor_ref`.
 *
 * Idempotent and safe to call on every request. The behaviour and its failure
 * modes are the package's; this supplies the hub's authenticated client.
 *
 * @returns the person's stable platform ID.
 * @throws when provisioning fails or returns no ref.
 */
export async function ensurePersonActor(): Promise<string> {
  return ensure(await createServerClient());
}

/**
 * Reads a person actor through the safe projection. Null when not found.
 *
 * Absence and failure stay distinct — see `@aeleos/identity`. This supplies the
 * hub's authenticated client and nothing else.
 *
 * @param actorRef - the platform ID to look up.
 * @returns the actor, or null when no row matches.
 * @throws on any failure that is not "no rows matched".
 */
export async function getPersonActor(
  actorRef: string,
): Promise<PersonActor | null> {
  return read(await createServerClient(), actorRef);
}
