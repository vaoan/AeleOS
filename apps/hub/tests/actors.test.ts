import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase-server", () => ({
  createServerClient: vi.fn(async () => ({ rpc, from })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensurePersonActor", () => {
  it("returns the actor_ref the database reports", async () => {
    rpc.mockResolvedValueOnce({ data: "ref-123", error: null });
    const { ensurePersonActor } = await import("@/lib/actors");
    await expect(ensurePersonActor()).resolves.toBe("ref-123");
    expect(rpc).toHaveBeenCalledWith("ensure_person_actor");
  });

  it("throws with the database message when provisioning fails", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "no authenticated subject" },
    });
    const { ensurePersonActor } = await import("@/lib/actors");
    await expect(ensurePersonActor()).rejects.toThrow(
      /no authenticated subject/,
    );
  });

  // The RPC reporting neither a ref nor an error should be impossible. If it
  // ever happens, `data as string` would hand null to the caller as a string
  // and /me would render an empty platform ID as though all were well.
  it("throws rather than returning a ref of null when the rpc reports nothing", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { ensurePersonActor } = await import("@/lib/actors");
    await expect(ensurePersonActor()).rejects.toThrow(/no actor_ref/i);
  });

  it("throws when the rpc returns something that is not a ref", async () => {
    rpc.mockResolvedValueOnce({ data: 42, error: null });
    const { ensurePersonActor } = await import("@/lib/actors");
    await expect(ensurePersonActor()).rejects.toThrow(/no actor_ref/i);
  });

  it("propagates a failure to build the client instead of masking it", async () => {
    const { createServerClient } = await import("@/lib/supabase-server");
    vi.mocked(createServerClient).mockRejectedValueOnce(
      new Error("NEXT_PUBLIC_SUPABASE_URL missing"),
    );
    const { ensurePersonActor } = await import("@/lib/actors");
    await expect(ensurePersonActor()).rejects.toThrow(/SUPABASE_URL missing/);
  });
});

describe("getPersonActor", () => {
  it("maps snake_case columns to the camelCase shape", async () => {
    single.mockResolvedValueOnce({
      data: {
        id: "local-1",
        actor_ref: "ref-123",
        handle: "u-abc",
        display_name: "Aeleos",
        avatar_url: "https://img.example/a.png",
      },
      error: null,
    });
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("ref-123")).resolves.toEqual({
      id: "local-1",
      actorRef: "ref-123",
      handle: "u-abc",
      displayName: "Aeleos",
      avatarUrl: "https://img.example/a.png",
    });
  });

  it("returns null when no row matches rather than throwing", async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } });
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("missing")).resolves.toBeNull();
  });

  // Deviation from the plan. The plan returned null for *any* error, so an RLS
  // denial or a dropped connection was indistinguishable from "this person has
  // no actor" — /me would render an em-dash and report success.
  it("throws on a real failure instead of reporting no actor", async () => {
    single.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "permission denied for actors_public" },
    });
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("ref-123")).rejects.toThrow(
      /permission denied/,
    );
  });

  // Deviation from the plan. actors_public is the exposure boundary: owner_ref
  // and identity_sub are absent from it by construction. Without this, a read
  // retargeted at the base table would leak the sacred column and still pass.
  it("reads through the actors_public view, never the base table", async () => {
    single.mockResolvedValueOnce({
      data: {
        id: "local-1",
        actor_ref: "ref-123",
        handle: "u-abc",
        display_name: null,
        avatar_url: null,
      },
      error: null,
    });
    const { getPersonActor } = await import("@/lib/actors");
    await getPersonActor("ref-123");

    expect(from).toHaveBeenCalledWith("actors_public");
    expect(select).toHaveBeenCalledWith(
      "id, actor_ref, handle, display_name, avatar_url",
    );
    expect(eq).toHaveBeenCalledWith("actor_ref", "ref-123");
  });

  // A transport failure arrives without PostgREST's `code`. Matching only on
  // code would let it fall through to the not-found branch and report the
  // person has no actor.
  it("throws on a transport error that carries no PostgREST code", async () => {
    single.mockResolvedValueOnce({
      data: null,
      error: { message: "fetch failed" },
    });
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("ref-123")).rejects.toThrow(/fetch failed/);
  });

  // Casting each column with `as string` makes a truncated row look complete;
  // the caller would get an actor whose id is undefined and never know.
  it("throws when the row is missing a column the type promises", async () => {
    single.mockResolvedValueOnce({
      data: { actor_ref: "ref-123", handle: "u-abc" },
      error: null,
    });
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("ref-123")).rejects.toThrow(/incomplete/i);
  });

  it("propagates a failure to build the client instead of masking it", async () => {
    const { createServerClient } = await import("@/lib/supabase-server");
    vi.mocked(createServerClient).mockRejectedValueOnce(
      new Error("NEXT_PUBLIC_SUPABASE_URL missing"),
    );
    const { getPersonActor } = await import("@/lib/actors");
    await expect(getPersonActor("ref-123")).rejects.toThrow(
      /SUPABASE_URL missing/,
    );
  });
});
