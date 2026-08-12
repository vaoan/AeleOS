import { createServerClient } from "@/lib/supabase-server";

/**
 * A person's actor, as exposed by the `actors_public` view.
 *
 * Never carries `owner_ref` or `identity_sub`. Those are absent from the view
 * by construction, which is what makes this shape safe to hand to a client —
 * see `tests/idp/clerk-actor-model.test.ts`.
 */
export type PersonActor = {
  id: string;
  actorRef: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** PostgREST's code for "`.single()` matched no rows" — an answer, not a fault. */
const NO_ROWS = "PGRST116";

/**
 * Ensures the signed-in person has an actor row, returning its `actor_ref`.
 *
 * Idempotent and safe to call on every request: the database derives the ref
 * deterministically from the identity claim and returns the stored value.
 */
export async function ensurePersonActor(): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("ensure_person_actor");
  if (error)
    throw new Error(`Could not provision person actor: ${error.message}`);
  // Neither a ref nor an error should be possible. Casting instead would hand
  // the caller null typed as a string, and /me would render an empty platform
  // ID as though provisioning had succeeded.
  if (typeof data !== "string" || data.length === 0)
    throw new Error("Provisioning returned no actor_ref");
  return data;
}

/**
 * Reads a person actor through the safe projection. Null when not found.
 *
 * Only "no rows" becomes null. Every other error is rethrown: an RLS denial, a
 * dropped connection or a missing view are faults, and collapsing them into
 * null would render /me as a blank identity while reporting success. Absence
 * and failure are different answers, and anything added here must keep them
 * apart.
 *
 * @param actorRef - the platform ID to look up, as returned by
 * `ensurePersonActor`.
 * @returns the actor, or null when no row matches.
 * @throws on any failure that is not "no rows matched".
 */
export async function getPersonActor(
  actorRef: string,
): Promise<PersonActor | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("actors_public")
    .select("id, actor_ref, handle, display_name, avatar_url")
    .eq("actor_ref", actorRef)
    .single();

  if (error) {
    if (error.code === NO_ROWS) return null;
    throw new Error(`Could not read person actor: ${error.message}`);
  }
  if (!data) return null;

  // `as string` on a truncated row yields an actor with undefined fields that
  // type-checks and renders blank. The three below are NOT NULL in the schema,
  // so their absence means the projection changed, not that data is missing.
  const { id, actor_ref, handle } = data;
  if (
    typeof id !== "string" ||
    typeof actor_ref !== "string" ||
    typeof handle !== "string"
  )
    throw new Error(`Person actor row is incomplete for actor_ref ${actorRef}`);

  return {
    id,
    actorRef: actor_ref,
    handle,
    displayName: (data.display_name as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}
