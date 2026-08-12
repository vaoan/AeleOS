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
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

// The lazy `env` object used to be covered only as a side effect of the
// Supabase client's tests. Those now mock this module — correctly, since they
// test an adapter — so its own contract is asserted here, where it belongs.
describe("env", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates process.env on first access, not at import time", async () => {
    const env = await freshEnv();
    expect(env.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(env.supabaseAnonKey).toBe("anon-key");
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
