import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * The validated environment this app needs to reach Clerk and Supabase.
 *
 * Both values are public by design — they ship in the browser bundle. The Clerk
 * secret key is deliberately absent: it is read from `process.env` at the point
 * of use and never travels through here.
 */
export type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

/**
 * Validates raw environment values. Exported separately from `env` so tests can
 * exercise it without mutating process.env.
 *
 * @param raw - the unvalidated values, normally read from `process.env`.
 * @returns the validated values in their typed shape.
 * @throws naming every missing or malformed variable, so the message says which
 * one to fix rather than merely that something is wrong.
 */
export function readEnv(raw: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${names}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function loadEnv(): Env {
  return readEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

// Lazy by design: a plain `export const env = readEnv(...)` here would run at
// module-evaluation time for *any* import from this file — including
// `import { readEnv } from "@/lib/env"` in tests/env.test.ts, since ES module
// bodies execute in full regardless of which named export is used. That would
// make the unit tests require a real .env.local. Getters defer validation to
// first property access, which is still before any consumer can use a bad or
// missing value. The result is memoized after the first successful read so
// repeated access (e.g. reading both properties per request) doesn't re-run
// the zod parse every time.
let cached: Env | undefined;
export const env: Env = {
  get supabaseUrl() {
    return (cached ??= loadEnv()).supabaseUrl;
  },
  get supabaseAnonKey() {
    return (cached ??= loadEnv()).supabaseAnonKey;
  },
};
