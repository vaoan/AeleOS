import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A person's actor, as exposed by the `actors_public` view.
 *
 * Never carries `owner_ref` or `identity_sub`. Those are absent from the view
 * by construction, which is what makes this shape safe to hand to a client.
 *
 * It gained `visibility` on 2026-08-14, because a person is provisioned
 * `private` and a consuming app has to know that before offering a link to
 * their public profile. Widening this shape is exactly what the projection
 * guard in `tests/actors.test.ts` exists to catch, so that test was
 * strengthened rather than merely updated: it now asserts the two linkability
 * columns never appear, so the next addition fails on WHAT it added.
 */
export type PersonActor = {
  id: string;
  actorRef: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /**
   * Who may see this person's own profile page.
   *
   * A person is provisioned `private`, so this is what a consuming app reads
   * before offering to link to their public profile — a link to a page that
   * answers 404 is worse than no link.
   *
   * It is NOT a linkability column: `actors_public` has always returned it, and
   * it says nothing about which fursonas somebody owns. `identity_sub` and
   * `owner_ref` remain absent, by construction rather than by omission.
   */
  visibility: "private" | "unlisted" | "public";
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
 * `visibility` is the one column defaulted rather than rejected when absent.
 * The others are identity — a missing `handle` means the view changed and the
 * caller must hear about it — while an unknown visibility has a safe reading,
 * and the safe reading of "we do not know who may see this" is `private`.
 *
 * @throws on any failure that is not "no rows matched", and when a NOT NULL
 * identity column is missing from the row — which means the view changed, not
 * that data is absent.
 */
export async function getPersonActor(
  client: SupabaseClient,
  actorRef: string,
): Promise<PersonActor | null> {
  const { data, error } = await client
    .from("actors_public")
    .select("id, actor_ref, handle, display_name, avatar_url, visibility")
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
    // Defaulted rather than trusted. The column is NOT NULL, so a missing value
    // means the view changed shape — and the safe reading of "we do not know
    // who may see this" is the most private one, never the most open.
    visibility:
      (data.visibility as PersonActor["visibility"] | null) ?? "private",
  };
}
