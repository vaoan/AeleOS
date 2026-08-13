import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const getToken = vi.fn(async () => "clerk-token");
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken }) }));

// Typed with a rest parameter so the forwarding below type-checks, and so the
// captured call can be indexed: a zero-argument `vi.fn` records `[]`.
const createIdentityClient = vi.fn<(...a: unknown[]) => unknown>(() => ({}));
vi.mock("@aeleos/identity", () => ({
  createIdentityClient: (...a: unknown[]) => createIdentityClient(...a),
}));

vi.mock("@/shared/infrastructure/env", () => ({
  env: { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon-key" },
}));

const { useSupabaseBrowserClient } =
  await import("@/shared/infrastructure/supabase-browser");

describe("useSupabaseBrowserClient", () => {
  beforeEach(() => {
    createIdentityClient.mockClear();
    getToken.mockReset();
    getToken.mockImplementation(async () => "clerk-token");
  });

  it("reaches the project named in the validated env", () => {
    renderHook(() => useSupabaseBrowserClient());
    expect(createIdentityClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://x.supabase.co",
        anonKey: "anon-key",
      }),
    );
  });

  // The same invariant the server adapter has: hand over the token SOURCE, not
  // a token already read. A stale token makes RLS answer as nobody, which is an
  // empty result rather than an error — a silent wrong answer.
  it("forwards Clerk's token source, so each call reads a fresh token", async () => {
    let n = 0;
    getToken.mockImplementation(async () => `clerk-token-${++n}`);
    renderHook(() => useSupabaseBrowserClient());
    const passed = createIdentityClient.mock.calls[0]![0] as {
      getToken: () => Promise<string | null>;
    };
    expect(await passed.getToken()).toBe("clerk-token-1");
    expect(await passed.getToken()).toBe("clerk-token-2");
  });

  // Rebuilding the client on every render would hand React Query a different
  // client object each time, which is the kind of bug that shows up as a cache
  // that never hits rather than as an error.
  it("returns the same client across renders", () => {
    const { result, rerender } = renderHook(() => useSupabaseBrowserClient());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
