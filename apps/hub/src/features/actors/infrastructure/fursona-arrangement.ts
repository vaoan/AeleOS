import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@/features/actors/infrastructure/fursonas";
import type { Block } from "@/features/actors/domain/block-schema";

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
 * The database refused the page itself — its shape, its depth, or its size.
 *
 * **A class rather than a message the caller matches on, and the reason is a
 * bug this replaced.** The editor used to classify a refusal with
 * `/section|too many|too large|too long/i`, written when every message
 * `set_actor_sections` could raise carried the word "section". Every per-block
 * message begins `block N:` now — `unknown kind`, `too deep`,
 * `title_en is required`, `a leaf holds no children` — and none of them
 * contains any of those four words, so the commonest refusal stopped matching,
 * threw past the handler, and the person was shown nothing at all. Prose is
 * not an interface; a class is.
 *
 * **What it is built from is the SQLSTATE, which the migration sets
 * deliberately.** Every validation refusal in `0009` raises `22023`
 * (`invalid_parameter_value`) and every ownership refusal raises `42501`
 * (`insufficient_privilege`) — two codes, chosen so the two are
 * distinguishable without reading a sentence. `tests/db/blocks.test.ts` asserts
 * both codes reach a PostgREST client, because that is the layer this contract
 * actually crosses.
 */
export class PageRefusedError extends Error {}

/** The SQLSTATE every validation refusal in `0009` raises. */
const INVALID_PARAMETER_VALUE = "22023";

/**
 * Calls one of `0009`'s or `0012`'s functions and turns a refusal into a throw.
 *
 * A validation refusal becomes {@link PageRefusedError}; everything else keeps
 * the database's own message on a plain `Error`, so an unrecognised fault
 * propagates rather than being flattened into something a caller might swallow.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param fn - the function name.
 * @param args - its named arguments.
 * @throws PageRefusedError when the database refused the payload's shape,
 * depth or size — SQLSTATE `22023`.
 * @throws with the database's message otherwise. The arrangement functions all
 * raise `fursona not found` for a row that is missing, someone else's, or not
 * active — deliberately indistinguishable, so a caller cannot probe which
 * actor_refs are real.
 */
async function call(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.rpc(fn, args);
  if (!error) return;
  if (error.code === INVALID_PARAMETER_VALUE)
    throw new PageRefusedError(error.message);
  throw new Error(error.message);
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
 * Deletes a fursona, and its pictures with it.
 *
 * **This never frees the handle.** The row is marked deleted and kept, so a
 * retired fursona's name cannot be registered by somebody else — and it keeps
 * occupying its owner's quota, or deleting would become a way to buy allowance
 * back.
 *
 * **Nothing has to be swept up first any more.** This used to remove the
 * fursona's uploaded images before marking the row, in a forced order, because
 * the storage delete policy required the actor to still be active. There is no
 * bucket now — a picture is an address somebody pasted at a host that was never
 * ours — so a delete is one write again.
 *
 * So a failed cleanup **stops the delete**, deliberately. The fursona survives,
 * the person is told, and a second attempt is safe because removing an already
 * removed object is not an error. The alternative — deleting anyway — trades a
 * visible failure for storage nobody can ever free.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona to delete.
 * @throws when the caller does not own an
 * active fursona with that ref. The fursona is intact in both cases.
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
 * **Replaces rather than merges**, matching `set_actor_sections` in `0009`:
 * the editor sends the whole document on every save, so merging would double it
 * on the second one. That also makes a retry after a failed save safe, which is
 * what lets the editor keep somebody's writing on screen and simply try again.
 *
 * The database validates the shape and raises a message naming the PATH of the
 * block that is wrong — `block 2.3:` — because the editor has to say what to
 * fix.
 *
 * **Nothing is converted here any more.** The editor composes the tree the
 * database accepts, so what the form holds is what is sent; the shim that
 * stood between them converts a stored FLAT page forward on the read instead,
 * which is the only direction left with a caller.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the fursona whose sections these are.
 * @param blocks - the whole page, as the editor composed it.
 * @throws PageRefusedError when the shape, the depth or the limits are
 * refused.
 * @throws when the caller does not own an active fursona with that ref.
 */
export async function setFursonaSections(
  client: SupabaseClient,
  actorRef: string,
  blocks: readonly Block[],
): Promise<void> {
  await call(client, "set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: blocks,
  });
}
