import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A person's actor, as exposed by the `actors_public` view.
 *
 * Never carries `owner_ref` or `identity_sub`. Those are absent from the view
 * by construction, which is what makes this shape safe to hand to a client.
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
 *
 * @param client - a client authenticated as the person being provisioned.
 * @returns the person's stable platform ID.
 * @throws when provisioning fails, or when it reports neither a ref nor an
 * error — which would otherwise hand the caller an empty ID typed as a string.
 */
export async function ensurePersonActor(
  client: SupabaseClient,
): Promise<string> {
  const { data, error } = await client.rpc("ensure_person_actor");
  if (error)
    throw new Error(`Could not provision person actor: ${error.message}`);
  if (typeof data !== "string" || data.length === 0)
    throw new Error("Provisioning returned no actor_ref");
  return data;
}

/**
 * Reads a person actor through the safe projection. Null when not found.
 *
 * Only "no rows" becomes null. Every other error is rethrown: an RLS denial, a
 * dropped connection or a missing view are faults, and collapsing them into
 * null would render a blank identity while reporting success. Absence and
 * failure are different answers, and anything added here must keep them apart.
 *
 * @param client - a client authenticated as the reader.
 * @param actorRef - the platform ID to look up, as returned by
 * {@link ensurePersonActor}.
 * @returns the actor, or null when no row matches.
 * @throws on any failure that is not "no rows matched", and when a NOT NULL
 * column is missing from the row — which means the view changed, not that data
 * is absent.
 */
export async function getPersonActor(
  client: SupabaseClient,
  actorRef: string,
): Promise<PersonActor | null> {
  const { data, error } = await client
    .from("actors_public")
    .select("id, actor_ref, handle, display_name, avatar_url")
    .eq("actor_ref", actorRef)
    .single();

  if (error) {
    if (error.code === NO_ROWS) return null;
    throw new Error(`Could not read person actor: ${error.message}`);
  }
  if (!data) return null;

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
