import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Wrap the real createClient rather than replacing it: capturing the options
// proves the Clerk token is forwarded, while still calling through proves this
// version of supabase-js accepts the option shape.
const { createClientSpy } = vi.hoisted(() => ({ createClientSpy: vi.fn() }));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: (...args: Parameters<typeof actual.createClient>) => {
      createClientSpy(...args);
      return actual.createClient(...args);
    },
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ getToken: async () => "clerk-token-abc" })),
}));

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = "anon-key";

beforeAll(() => {
  // createServerClient reads the lazy `env` object, which validates against
  // process.env on first access. Without these there is no .env.local under
  // vitest and every test here fails on env validation instead of on behaviour.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

type CapturedOptions = { accessToken?: () => Promise<string | null> };

/**
 * The `accessToken` callback supabase-js was actually handed. Throwing rather
 * than asserting keeps the failure message pointed at the real defect: a
 * createServerClient that stops passing the option at all.
 */
function lastAccessToken(): () => Promise<string | null> {
  const call = createClientSpy.mock.calls.at(-1);
  if (!call) throw new Error("createClient was never called");
  const accessToken = (call[2] as CapturedOptions | undefined)?.accessToken;
  if (typeof accessToken !== "function") {
    throw new Error("createClient was called without an accessToken callback");
  }
  return accessToken;
}

describe("createServerClient", () => {
  it("forwards the Clerk token to Supabase via accessToken", async () => {
    const { createServerClient } = await import("@/lib/supabase-server");
    const client = await createServerClient();

    expect(client).toBeDefined();
    expect(createClientSpy).toHaveBeenCalledWith(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      expect.anything(),
    );
    await expect(lastAccessToken()()).resolves.toBe("clerk-token-abc");
  });

  it("forwards null when Clerk has no token, rather than throwing", async () => {
    const clerk = await import("@clerk/nextjs/server");
    vi.mocked(clerk.auth).mockResolvedValueOnce({
      getToken: async () => null,
    } as unknown as Awaited<ReturnType<typeof clerk.auth>>);

    const { createServerClient } = await import("@/lib/supabase-server");
    await expect(createServerClient()).resolves.toBeDefined();
    await expect(lastAccessToken()()).resolves.toBeNull();
  });

  it("creates no Supabase session of its own", async () => {
    const { createServerClient } = await import("@/lib/supabase-server");
    await createServerClient();

    const call = createClientSpy.mock.calls.at(-1);
    expect(call?.[2]).toMatchObject({
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });
});
