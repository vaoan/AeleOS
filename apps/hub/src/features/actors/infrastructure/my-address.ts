import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The caller's own public address.
 *
 * **This exists because nothing else could tell them.** `person_addresses`
 * grants no client role anything — a readable table would be an enumerator over
 * every person on the platform — so without `my_address` somebody could have a
 * public profile and no way to discover its URL.
 *
 * The vanity when they have one, else their number. Both keep resolving; this
 * is the one to show and the one to link to.
 *
 * @param client - a Supabase client authenticated as the person.
 * @returns their canonical address, or `undefined` when they have none — which
 * a suspended person also gets, because the function resolves through
 * `current_person_ref()` and carries its active filter.
 * @throws when the read fails, which is not the same as having no address.
 */
export async function readMyAddress(
  client: SupabaseClient,
): Promise<string | undefined> {
  const { data, error } = await client.rpc("my_address");
  if (error) throw new Error(`Could not read your address: ${error.message}`);
  return (data as string | null) ?? undefined;
}
