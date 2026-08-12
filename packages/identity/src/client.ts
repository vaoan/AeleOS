import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supplies the current caller's access token, or null when nobody is signed in.
 *
 * A function rather than a string on purpose: it is invoked per request, so a
 * refreshed token is used and an expired one is never reused.
 *
 * **Null is not "no authentication" — it is authentication as `anon`.** With no
 * token to forward, supabase-js falls back to `Authorization: Bearer <anonKey>`,
 * so the request still reaches PostgREST and RLS still runs; it simply evaluates
 * against the anonymous role. Row-level policies keyed to `auth.jwt()->>'sub'`
 * then match nothing, and the caller gets an **empty result, not an error**. A
 * caller that must never serve anonymous data cannot detect that case from the
 * query — it has to gate on the session before querying at all (the hub does
 * this with `auth.protect()` in its authenticated layout).
 */
export type GetToken = () => Promise<string | null>;

/** What a caller must supply to reach its own Supabase project. */
export interface IdentityClientOptions {
  /** The caller's token source. */
  getToken: GetToken;
  /** The Supabase project URL. */
  url: string;
  /** The project's anon key. */
  anonKey: string;
}

/**
 * A Supabase client that authenticates as the signed-in person.
 *
 * There is no Supabase session: the project trusts the token issuer directly
 * via Third-Party Auth, so the caller's token is forwarded and RLS resolves the
 * person from it.
 *
 * **This function never learns which provider issued the token.** `getToken` is
 * a parameter, so swapping the issuer changes the caller and nothing here —
 * which is what keeps that migration a one-column `identity_sub` backfill
 * rather than a change to every app that depends on this package.
 *
 * **Build the client per request whenever `getToken` is request-bound.** The
 * returned client closes over the `getToken` it was given; it does not re-derive
 * one. Request-scoped accessors — Clerk's `auth()`, and the equivalent in any
 * other framework — are bound to the request that produced them, so a client
 * built once at module load and reused would keep forwarding the *first*
 * request's token and answer every later request as the wrong person. The
 * "freshly-read token" below means fresh for that one `getToken`, not fresh for
 * whoever is calling now. Hoisting is safe only when `getToken` reads the
 * current caller itself rather than being captured from a request.
 *
 * A `getToken` that resolves null authenticates as `anon` rather than failing —
 * see {@link GetToken} for what that costs a caller.
 *
 * @param options - the token source and the project to reach.
 * @returns a client that attaches a freshly-read token to every request.
 */
export function createIdentityClient(
  options: IdentityClientOptions,
): SupabaseClient {
  const { getToken, url, anonKey } = options;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => (await getToken()) ?? null,
  });
}
