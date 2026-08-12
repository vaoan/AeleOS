import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdentityClient } from "../src/client";

/**
 * Built against the real, unmocked `@supabase/supabase-js` on purpose.
 *
 * `client.test.ts` replaces the module wholesale, which is right for asserting
 * what this package *passes* but blind to whether supabase-js still *accepts*
 * it. If `accessToken` were renamed or dropped, every mocked test would stay
 * green while the app sent the anon key in place of the person's token — an
 * empty result rather than an error. This is the one test holding that guard,
 * so it must never start mocking the library.
 */
describe("createIdentityClient against the real supabase-js", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still gets the token onto the wire via the accessToken option", async () => {
    const calls = vi.fn<(...a: unknown[]) => Promise<Response>>(
      async () =>
        new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    // Stubbed before construction: supabase-js resolves its fetch once, when
    // the client is built.
    vi.stubGlobal("fetch", calls);

    const client = createIdentityClient({
      getToken: async () => "issued-token",
      url: "https://x.supabase.co",
      anonKey: "anon-key",
    });
    await client.from("actors_public").select("id").eq("actor_ref", "act_abc");

    expect(calls).toHaveBeenCalled();
    const init = calls.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer issued-token");
  });
});
