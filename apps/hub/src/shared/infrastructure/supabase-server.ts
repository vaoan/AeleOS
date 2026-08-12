import { auth } from "@clerk/nextjs/server";
import { createIdentityClient } from "@aeleos/identity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/shared/infrastructure/env";

/**
 * Supabase client for Server Components and Route Handlers.
 *
 * The plumbing lives in `@aeleos/identity`, which takes `getToken` as a
 * parameter and therefore never learns the issuer is Clerk. This function is
 * the adapter that supplies it — the only file in the hub that names both
 * sides, and so the only one a change of issuer would touch.
 *
 * `getToken` is handed over as a function, never as an already-read token: the
 * package invokes it per request, so an expired token is never reused.
 *
 * @returns a client that authenticates as the signed-in person.
 * @throws when Clerk is unreachable, or when the Supabase env is unset.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const { getToken } = await auth();
  return createIdentityClient({
    getToken,
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
  });
}
