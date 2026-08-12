import { describe, expect, it, vi, beforeEach } from "vitest";

const getToken = vi.fn(async () => "clerk-token");
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ getToken })),
}));

// Typed with a rest parameter so the forwarding below type-checks, and so the
// captured call can be indexed: a zero-argument `vi.fn` records `[]`.
const createIdentityClient = vi.fn<(...a: unknown[]) => unknown>(() => ({}));
vi.mock("@aeleos/identity", () => ({
  createIdentityClient: (...a: unknown[]) => createIdentityClient(...a),
}));

vi.mock("@/shared/infrastructure/env", () => ({
  env: { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon-key" },
}));

const { createServerClient } =
  await import("@/shared/infrastructure/supabase-server");

describe("createServerClient", () => {
  beforeEach(() => createIdentityClient.mockClear());

  it("reaches the project named in the validated env", async () => {
    await createServerClient();
    expect(createIdentityClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://x.supabase.co",
        anonKey: "anon-key",
      }),
    );
  });

  // The one thing only this file can get wrong: it must hand over Clerk's
  // token *source*, not a token it already read. A resolved token goes stale
  // and RLS then answers as nobody — an empty result rather than an error,
  // which is a silent wrong answer.
  it("forwards Clerk's token source, so each call reads a fresh token", async () => {
    let n = 0;
    getToken.mockImplementation(async () => `clerk-token-${++n}`);
    await createServerClient();
    const passed = createIdentityClient.mock.calls[0]![0] as {
      getToken: () => Promise<string | null>;
    };
    expect(await passed.getToken()).toBe("clerk-token-1");
    expect(await passed.getToken()).toBe("clerk-token-2");
  });

  // The `@throws` this function documents. If Clerk is unreachable the request
  // must fail, not proceed as anonymous: an unauthenticated PostgREST call is
  // one RLS policy away from reading as the anon role rather than as the
  // person. Building the client anyway is the specific wrong answer, so that
  // is asserted rather than merely the rejection.
  //
  // Propagation has no branch, so branch coverage sails past its absence —
  // this is why 100% did not notice when the test was missing.
  it("propagates a Clerk outage instead of building an anonymous client", async () => {
    const clerk = await import("@clerk/nextjs/server");
    vi.mocked(clerk.auth).mockRejectedValueOnce(new Error("Clerk unavailable"));

    await expect(createServerClient()).rejects.toThrow(/Clerk unavailable/);
    expect(createIdentityClient).not.toHaveBeenCalled();
  });
});
