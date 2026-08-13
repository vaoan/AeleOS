"use client";

import { useAuth } from "@clerk/nextjs";
import { createIdentityClient } from "@aeleos/identity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { env } from "@/shared/infrastructure/env";

/**
 * Supabase client for Client Components.
 *
 * The browser counterpart of `createServerClient`, and the only file in the
 * browser bundle that names both Clerk and Supabase. `@aeleos/identity` takes
 * `getToken` as a parameter and so still never learns the issuer — which is
 * what keeps swapping issuers a one-column `identity_sub` backfill rather than
 * a change to every app on the platform. **Do not move the Clerk import into
 * that package to save this adapter.**
 *
 * A hook rather than a plain function because Clerk's browser token source
 * comes from `useAuth()`. `getToken` is handed over as a function, never as a
 * token this already read: a resolved token goes stale, and RLS then answers as
 * nobody — an empty result rather than an error, which is a silent wrong
 * answer.
 *
 * Memoised on the token source, so React Query sees one stable client rather
 * than a new one per render.
 *
 * @returns a client that authenticates as the signed-in person.
 */
export function useSupabaseBrowserClient(): SupabaseClient {
  const { getToken } = useAuth();
  return useMemo(
    () =>
      createIdentityClient({
        getToken,
        url: env.supabaseUrl,
        anonKey: env.supabaseAnonKey,
      }),
    [getToken],
  );
}
