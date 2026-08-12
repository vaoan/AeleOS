import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn<(...args: unknown[]) => unknown>(() => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

const { createIdentityClient } = await import("../src/client");

/** The options object passed to `createClient`, as this package builds it. */
type Passed = {
  auth: { persistSession: boolean; autoRefreshToken: boolean };
  accessToken: () => Promise<string | null>;
};

/**
 * Builds a client and hands back the third argument `createClient` received.
 *
 * @param getToken - the token source under test.
 * @returns the options object the package constructed.
 */
function optionsFor(getToken: () => Promise<string | null>): Passed {
  createClient.mockClear();
  createIdentityClient({
    getToken,
    url: "https://x.supabase.co",
    anonKey: "k",
  });
  return createClient.mock.calls[0]![2] as Passed;
}

describe("createIdentityClient", () => {
  it("passes the url and key through to Supabase", () => {
    createClient.mockClear();
    createIdentityClient({
      getToken: async () => "t",
      url: "https://x.supabase.co",
      anonKey: "k",
    });
    expect(createClient.mock.calls[0]![0]).toBe("https://x.supabase.co");
    expect(createClient.mock.calls[0]![1]).toBe("k");
  });

  // There is no Supabase session — Supabase trusts the issuer directly — so a
  // persisted session would be a second, stale source of identity.
  it("holds no session of its own", () => {
    const opts = optionsFor(async () => "t");
    expect(opts.auth.persistSession).toBe(false);
    expect(opts.auth.autoRefreshToken).toBe(false);
  });

  // A callback rather than a resolved value: resolving once would pin the
  // client to whatever token was valid at construction, and every later
  // request would send an expired one.
  it("asks for a fresh token on every call", async () => {
    let calls = 0;
    const opts = optionsFor(async () => `token-${++calls}`);
    expect(await opts.accessToken()).toBe("token-1");
    expect(await opts.accessToken()).toBe("token-2");
  });

  it("yields null when there is no token, rather than undefined", async () => {
    const opts = optionsFor(async () => null);
    expect(await opts.accessToken()).toBeNull();
  });

  // A token source that fails must reject, not resolve to null. Swallowing it
  // would send the request with no token at all, and PostgREST would answer as
  // the anon role — an empty result rather than an error, which reads as "this
  // person has nothing" instead of "we could not ask".
  //
  // Propagation has no branch, so branch coverage cannot notice its absence.
  it("propagates a failure from the token source instead of sending none", async () => {
    const opts = optionsFor(async () => {
      throw new Error("token endpoint 503");
    });
    await expect(opts.accessToken()).rejects.toThrow(/token endpoint 503/);
  });
});
