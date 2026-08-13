import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn<() => Promise<{ userId: string | null }>>();
const listMyActors = vi.fn<(...a: unknown[]) => unknown>();

// @clerk/nextjs/server, not a wrapper: this route is the one place the
// proxy's own auth.protect() does not run (see public-routes.ts), so the
// handler's own auth() call is the only gate — mocking anything else would
// leave that gate untested.
vi.mock("@clerk/nextjs/server", () => ({
  auth: (...a: unknown[]) => auth(...(a as [])),
}));
vi.mock("@/features/actors", () => ({
  listMyActors: (...a: unknown[]) => listMyActors(...a),
}));

const { GET } = await import("@/app/api/actors/mine/route");

/**
 * An actor row as `listMyActors` returns it, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
function actor(over: Partial<Record<string, unknown>> = {}) {
  return {
    actorRef: "ref-s",
    kind: "fursona",
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "private",
    status: "active",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ userId: "user_1" });
  listMyActors.mockResolvedValue([actor()]);
});

describe("GET /api/actors/mine", () => {
  it("returns the caller's actors", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ actors: [actor()] });
  });

  // Auth first, then read: an unauthenticated caller must never reach the
  // database, or a caller with no session would still spend a query.
  it("answers 401 without calling listMyActors when unauthenticated", async () => {
    auth.mockResolvedValue({ userId: null });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listMyActors).not.toHaveBeenCalled();
  });

  // The route lives outside [locale]/(app), so nothing else gates it. If this
  // reddens, the handler stopped checking auth() itself — see the sabotage
  // note in the task report for what that looks like in practice.
  it("never calls listMyActors before auth resolves who is asking", async () => {
    await GET();
    expect(auth).toHaveBeenCalled();
    expect(listMyActors).toHaveBeenCalledTimes(1);
  });

  // listMyActors already omits both columns by construction (see
  // features/actors/infrastructure/fursonas.ts), but this route is the one a
  // consuming app actually parses — asserting against the serialised text,
  // not the object, is what would catch a future field added under either
  // spelling.
  it("never puts owner_ref or identity_sub in the body, under any spelling", async () => {
    listMyActors.mockResolvedValue([
      actor({ owner_ref: "person-1", identity_sub: "clerk|abc" } as never),
    ]);
    const response = await GET();
    const text = await response.text();
    expect(text).not.toMatch(/owner_ref|ownerRef|identity_sub|identitySub/i);
  });

  it("sets cache-control: no-store on a successful response", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sets cache-control: no-store on the 401 response too", async () => {
    auth.mockResolvedValue({ userId: null });
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // Deliberate absence: adding Access-Control-Allow-Origin would let a
  // consuming app's own frontend JavaScript read another user's full actor
  // list through this endpoint — every legitimate caller is a server, which
  // needs no CORS header at all. This is what stops someone "helpfully"
  // adding one later.
  it("sets no Access-Control-Allow-Origin header on a successful response", async () => {
    const response = await GET();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sets no Access-Control-Allow-Origin header on the 401 response either", async () => {
    auth.mockResolvedValue({ userId: null });
    const response = await GET();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  // Without a catch here, a database failure falls through to Next's default
  // 500 HTML error page — exactly the "server-to-server caller parses HTML as
  // an actor list" failure this endpoint exists to avoid, just on the error
  // path instead of the auth one.
  it("answers a listMyActors failure as JSON, not Next's default HTML 500", async () => {
    listMyActors.mockRejectedValueOnce(new Error("Could not read your actors"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    await expect(response.json()).resolves.toEqual({
      error: "Could not read your actors",
    });
  });

  it("sets cache-control: no-store on the 500 response too", async () => {
    listMyActors.mockRejectedValueOnce(new Error("relation actors missing"));
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // The database's own error text can name a table or a constraint, and this
  // response is read by another company's server — the failure detail must
  // never reach the body.
  it("never forwards the underlying failure message", async () => {
    listMyActors.mockRejectedValueOnce(
      new Error('relation "actors" does not exist'),
    );
    const response = await GET();
    const text = await response.text();
    expect(text).not.toMatch(/relation|actors" does not exist/);
  });
});
