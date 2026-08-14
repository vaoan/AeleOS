import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@/features/actors/infrastructure/fursonas";

/** How one fursona is arranged in its owner's list. */
export interface Arrangement {
  /** The fursona's platform ID. */
  actorRef: string;
  /** Where the owner put it, or null when they never have. */
  sortOrder: number | null;
  /** Whether the owner pinned it first. */
  featured: boolean;
}

/**
 * Reads the caller's arrangement rows.
 *
 * A separate read from the actor list on purpose: `my_actors()` returns the
 * actor columns and `actor_profiles` holds the arrangement, and `0012` added
 * no joined view — a joined function would have put ordering into the same call
 * `/api/actors/mine` is built on, which the actor model deliberately keeps
 * apart.
 *
 * RLS returns only rows the caller owns, so this needs no filter of its own.
 *
 * @param client - a Supabase client authenticated as the person.
 * @returns one entry per fursona the person has arranged. Absent means never
 * arranged, which is not the same as "first".
 * @throws when the read fails, rather than reporting an empty arrangement —
 * collapsing a failure to `[]` would silently reset everybody's ordering.
 */
export async function readArrangement(
  client: SupabaseClient,
): Promise<Arrangement[]> {
  const { data, error } = await client
    .from("actor_profiles")
    .select("actor_ref, sort_order, featured");
  if (error) throw new Error(`Could not read arrangement: ${error.message}`);
  return (data ?? []).map((row) => ({
    actorRef: row.actor_ref as string,
    sortOrder: (row.sort_order as number | null) ?? null,
    featured: Boolean(row.featured),
  }));
}

/**
 * Reads the caller's own actors from the browser.
 *
 * The browser counterpart of `listMyActors`, and it must map the row shape the
 * same way — this is what the list refetches with after a delete, so a
 * disagreement between the two would make a row change shape when it reloads.
 *
 * Carries no `owner_ref` and no `identity_sub`, because `my_actors()` omits
 * them by construction.
 *
 * @param client - a Supabase client authenticated as the person.
 * @returns the person's actors, their own row first.
 * @throws when the list cannot be read.
 */
export async function readMyActors(client: SupabaseClient): Promise<Actor[]> {
  const { data, error } = await client.rpc("my_actors");
  if (error) throw new Error(`Could not read your actors: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    actorRef: row.actor_ref as string,
    kind: row.kind as Actor["kind"],
    handle: row.handle as string,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    visibility: row.visibility as Actor["visibility"],
    status: row.status as Actor["status"],
  }));
}

/**
 * Calls one of `0012`'s arrangement functions and turns a refusal into a throw.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param fn - the function name.
 * @param args - its named arguments.
 * @throws with the database's message when the call is refused. Every one of
 * these raises `fursona not found` for a row that is missing, someone else's,
 * or not active — deliberately indistinguishable, so a caller cannot probe
 * which actor_refs are real.
 */
async function call(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
}

/**
 * Moves a fursona to a position in its owner's list.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona to move.
 * @param sortOrder - its new position.
 * @throws when the caller does not own an active fursona with that ref.
 */
export async function setFursonaOrder(
  client: SupabaseClient,
  actorRef: string,
  sortOrder: number,
): Promise<void> {
  await call(client, "set_fursona_order", {
    p_actor_ref: actorRef,
    p_sort_order: sortOrder,
  });
}

/**
 * Pins or unpins a fursona.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona to pin.
 * @param featured - whether it should be pinned.
 * @throws when the caller does not own an active fursona with that ref.
 */
export async function setFursonaFeatured(
  client: SupabaseClient,
  actorRef: string,
  featured: boolean,
): Promise<void> {
  await call(client, "set_fursona_featured", {
    p_actor_ref: actorRef,
    p_featured: featured,
  });
}

/**
 * Deletes a fursona.
 *
 * **This never frees the handle.** `0012` marks the row deleted and keeps it, so
 * a retired fursona's name cannot be registered by somebody else — and the row
 * keeps occupying its owner's quota, or deleting would become a way to buy
 * allowance back.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona to delete.
 * @throws when the caller does not own an active fursona with that ref.
 */
export async function deleteFursona(
  client: SupabaseClient,
  actorRef: string,
): Promise<void> {
  await call(client, "delete_fursona", { p_actor_ref: actorRef });
}

/**
 * Replaces a fursona's sections.
 *
 * **Replaces rather than merges**, matching `set_actor_sections` in `0013`:
 * the editor sends the whole document on every save, so merging would double it
 * on the second one. That also makes a retry after a failed save safe, which is
 * what lets the editor keep somebody's writing on screen and simply try again.
 *
 * The database validates the shape and raises a message naming which section
 * and which item is wrong, because the editor has to say what to fix. It also
 * enforces the limits `SECTION_LIMITS` mirrors — the client copy is a courtesy,
 * this call is the authority.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona whose sections these are.
 * @param sections - the whole document.
 * @throws when the caller does not own an active fursona with that ref, or when
 * the shape or the limits are refused.
 */
export async function setFursonaSections(
  client: SupabaseClient,
  actorRef: string,
  sections: unknown,
): Promise<void> {
  await call(client, "set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: sections,
  });
}
