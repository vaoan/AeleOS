import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEnv, type Env } from "@/shared/infrastructure/env";

/**
 * A fresh copy of the module, so the memoized value starts unset.
 *
 * Without this each test would depend on whether an earlier one had already
 * populated the module-level cache, and running either alone would fail.
 *
 * @returns the lazy `env` object from a newly-evaluated module.
 */
async function freshEnv(): Promise<Env> {
  vi.resetModules();
  return (await import("@/shared/infrastructure/env")).env;
}

describe("readEnv", () => {
  it("returns typed values when all variables are present", () => {
    const result = readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      AELEOS_ALLOWED_RETURN_ORIGINS: "",
    });
    expect(result.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(result.supabaseAnonKey).toBe("anon-key");
  });

  it("names the missing variable rather than failing vaguely", () => {
    expect(() =>
      readEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("rejects a URL that is not a URL", () => {
    expect(() =>
      readEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        AELEOS_ALLOWED_RETURN_ORIGINS: "",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("splits and trims a comma-separated allowlist", () => {
    const result = readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      AELEOS_ALLOWED_RETURN_ORIGINS:
        " https://puck.furrycolombia.com , http://localhost:5000 ",
    });
    expect(result.allowedReturnOrigins).toEqual([
      "https://puck.furrycolombia.com",
      "http://localhost:5000",
    ]);
  });

  it("parses an empty allowlist as an empty array, not a boot failure", () => {
    const result = readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      AELEOS_ALLOWED_RETURN_ORIGINS: "",
    });
    expect(result.allowedReturnOrigins).toEqual([]);
  });

  // The variable is optional, and it has to be: it is validated in the same
  // safeParse as the Supabase URL that every request reads, so making it
  // required means a deployment target nobody set it on 500s the whole app
  // rather than merely refusing every return_to. A preview environment or an
  // older .env.local is exactly that target.
  it("boots with the allowlist variable absent entirely", () => {
    const result = readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(result.allowedReturnOrigins).toEqual([]);
    expect(result.supabaseUrl).toBe("http://127.0.0.1:54321");
  });

  /**
   * The allowlist parsed out of one raw comma-separated value.
   *
   * @param value - what a maintainer would type into the variable.
   * @returns the origins the picker's guard will compare against.
   */
  const origins = (value: string) =>
    readEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      AELEOS_ALLOWED_RETURN_ORIGINS: value,
    }).allowedReturnOrigins;

  // Three shapes a maintainer plausibly types, none of which is an origin.
  // `URL.origin` — what the guard compares against — is lowercase and never
  // carries a trailing slash or a path, so before normalisation each of these
  // matched nothing at all, silently and identically to "not added yet".
  it("normalises a trailing slash, a path and capitals to the bare origin", () => {
    expect(origins("https://puck.furrycolombia.com/")).toEqual([
      "https://puck.furrycolombia.com",
    ]);
    expect(origins("https://puck.furrycolombia.com/callback")).toEqual([
      "https://puck.furrycolombia.com",
    ]);
    expect(origins("HTTPS://PUCK.FURRYCOLOMBIA.COM")).toEqual([
      "https://puck.furrycolombia.com",
    ]);
  });

  // A default port is part of what "the same origin" means, so dropping it is
  // normalisation rather than rewriting: both spellings must match the same
  // candidate.
  it("drops a default port", () => {
    expect(origins("https://puck.furrycolombia.com:443")).toEqual([
      "https://puck.furrycolombia.com",
    ]);
    expect(origins("http://localhost:5000")).toEqual(["http://localhost:5000"]);
  });

  // Kept, not thrown on and not dropped: throwing would put back the boot
  // failure above, over a typo in a list only the picker reads. An entry that
  // is not an origin matches no candidate, which is what omitting it would do
  // anyway.
  it("keeps an unparseable or opaque entry verbatim rather than throwing", () => {
    expect(origins("not a url, javascript:alert(1)")).toEqual([
      "not a url",
      "javascript:alert(1)",
    ]);
  });
});

// The lazy `env` object used to be covered only as a side effect of the
// Supabase client's tests. Those now mock this module — correctly, since they
// test an adapter — so its own contract is asserted here, where it belongs.
describe("env", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("AELEOS_ALLOWED_RETURN_ORIGINS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates process.env on first access, not at import time", async () => {
    const env = await freshEnv();
    expect(env.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(env.supabaseAnonKey).toBe("anon-key");
    expect(env.allowedReturnOrigins).toEqual([]);
  });

  // Memoized after the first successful read, so a per-request read of both
  // properties does not re-run the zod parse twice for every request. Visible
  // only as later process.env changes being ignored.
  it("parses once and reuses the result", async () => {
    const env = await freshEnv();
    expect(env.supabaseUrl).toBe("http://127.0.0.1:54321");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://example.invalid");
    expect(env.supabaseUrl).toBe("http://127.0.0.1:54321");
  });
});
