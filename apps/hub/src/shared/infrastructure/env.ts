import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Defaulted, not required. `z.string()` alone rejects `undefined`, which
  // made an unset variable throw from the same `safeParse` that supplies the
  // Supabase URL — and `supabase-server` reads that on every request, so a
  // deployment target nobody remembered to configure (a preview environment, a
  // contributor's older .env.local) would 500 the entire app rather than
  // merely refuse every `return_to`. An absent allowlist is a deployment that
  // does not use the picker, not a broken one.
  AELEOS_ALLOWED_RETURN_ORIGINS: z.string().default(""),
});

/**
 * One allowlist entry as the origin guard will compare it.
 *
 * A maintainer types the address they have in their head, which is routinely
 * not an origin: `https://puck.furrycolombia.com/` with the trailing slash a
 * browser shows, the full callback URL they copied, or the host in capitals.
 * `URL.origin` is lowercase, has its default port dropped and never carries a
 * trailing slash, so every one of those would match nothing — silently, and
 * indistinguishably from "not added yet", which the integrator has already
 * been told is the expected first experience. Parsing each entry the way the
 * candidate is parsed removes the difference.
 *
 * Anything that does not parse, or that parses to an opaque origin (`data:`,
 * `javascript:`), is kept verbatim rather than dropped or thrown on: throwing
 * here would reintroduce exactly the boot failure the `default("")` above
 * removes, over a typo in a list only the picker consults. Kept verbatim it
 * matches no candidate — the guard only ever compares against the origin of an
 * `http:` or `https:` URL — which is the same outcome as omitting it.
 *
 * @param entry - one trimmed, non-empty entry from the comma list.
 * @returns its parsed origin, or the entry unchanged when it has none.
 */
function toOrigin(entry: string): string {
  try {
    const { origin } = new URL(entry);
    return origin === "null" ? entry : origin;
  } catch {
    return entry;
  }
}

/**
 * The validated environment this app needs to reach Clerk and Supabase.
 *
 * Both Supabase values are public by design — they ship in the browser bundle.
 * The Clerk secret key is deliberately absent: it is read from `process.env` at
 * the point of use and never travels through here.
 *
 * The two Supabase values are required and the allowlist is not: every request
 * reads the Supabase URL, so a deployment missing it is broken, while one
 * missing the allowlist is merely a deployment no app hands off to.
 */
export type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /**
   * Exact origins the picker may redirect back to, parsed from a comma list
   * and each normalised to its parsed origin, so a maintainer's trailing
   * slash, stray path or capitalisation still matches. Empty when unset — a
   * deployment not using the picker still boots, and the picker's origin guard
   * refuses every candidate against an empty list.
   */
  allowedReturnOrigins: string[];
};

/**
 * Validates raw environment values. Exported separately from `env` so tests can
 * exercise it without mutating process.env.
 *
 * The return-origin allowlist is split on commas, trimmed, and each entry
 * normalised through `toOrigin`. An **absent or empty** value yields an empty
 * array rather than a boot failure, so a deployment that does not use the
 * picker still starts — and starts fully, since the Supabase values every
 * request needs are validated in this same call.
 *
 * Its origin parser is called explicitly rather than passed by reference, so a second parameter added to it later cannot silently receive an array index.
 *
 * @param raw - the unvalidated values, normally read from `process.env`.
 * @returns the validated values in their typed shape.
 * @throws naming every missing or malformed variable, so the message says which
 * one to fix rather than merely that something is wrong. The return-origin
 * allowlist is never among them.
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
    allowedReturnOrigins: parsed.data.AELEOS_ALLOWED_RETURN_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== "")
      .map((origin) => toOrigin(origin)),
  };
}

function loadEnv(): Env {
  return readEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    AELEOS_ALLOWED_RETURN_ORIGINS: process.env.AELEOS_ALLOWED_RETURN_ORIGINS,
  });
}

// Lazy by design: a plain `export const env = readEnv(...)` here would run at
// module-evaluation time for *any* import from this file — including
// `import { readEnv } from "@/shared/infrastructure/env"` in tests/env.test.ts,
// since ES module bodies execute in full regardless of which named export is
// used. That would make the unit tests require a real .env.local. Getters defer
// validation to first property access, which is still before any consumer can
// use a bad or missing value. The result is memoized after the first successful
// read so repeated access (e.g. reading all three properties per request)
// doesn't re-run the zod parse every time. `allowedReturnOrigins` follows the
// same two getters it joined: lazy, memoized, and validated together with them
// since they share one `readEnv` call.
let cached: Env | undefined;

/**
 * The validated environment, read from `process.env` and memoized after the
 * first successful access — see the implementation comment above for why.
 *
 * @throws on first property access, naming every missing or malformed
 * variable — see `readEnv`.
 */
/**
 * The parsed environment, read once and kept.
 *
 * Named rather than assigned inside each getter's return expression: three
 * copies of `(cached ??= loadEnv())` put the one side effect this module has
 * inside a member lookup, where it reads as a property access.
 *
 * @returns the environment, loading it on first use.
 */
function loaded(): Env {
  cached ??= loadEnv();
  return cached;
}

export const env: Env = {
  get supabaseUrl() {
    return loaded().supabaseUrl;
  },
  get supabaseAnonKey() {
    return loaded().supabaseAnonKey;
  },
  get allowedReturnOrigins() {
    return loaded().allowedReturnOrigins;
  },
};
