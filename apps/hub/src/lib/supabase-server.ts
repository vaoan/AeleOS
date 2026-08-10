import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase client for Server Components and Route Handlers.
 *
 * There is no Supabase session. Supabase trusts Clerk directly via Third-Party
 * Auth, so the Clerk token is forwarded and RLS resolves the caller from it.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const { getToken } = await auth();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => (await getToken()) ?? null,
  });
}
