import { beforeEach, describe, expect, it, vi } from "vitest";

const authProtect = vi.fn(async () => undefined);

// Only clerkMiddleware is replaced — createRouteMatcher and everything else
// stay real, via importOriginal. Both isApiRoute (below) and isPublicRoute
// (which proxy.ts imports from @/features/session) depend on the real
// matcher, and the whole point of the "proxy default export" suite further
// down is to exercise proxy.ts's actual control flow, not a stand-in for it.
// The stub runs the handler directly against a controllable `auth`, because
// Clerk's real session resolution needs a live request context this test has
// no way to construct.
vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return {
    ...actual,
    clerkMiddleware:
      (handler: (auth: unknown, request: unknown) => unknown) =>
      (request: unknown) => {
        const auth = Object.assign(vi.fn(), { protect: authProtect });
        return handler(auth, request);
      },
  };
});

const intlMiddleware = vi.fn(() => "intl-response");
// next-intl/middleware's default export builds the real middleware from the
// routing config; replaced with a spy so "did the proxy reach the intl
// middleware" is a direct assertion on the default export's real control
// flow, rather than something inferred indirectly from isApiRoute alone.
vi.mock("next-intl/middleware", () => ({
  default: () => intlMiddleware,
}));

const { default: proxy, isApiRoute } = await import("@/proxy");

/**
 * Clerk's matcher reads the pathname off the request. A URL-bearing stub is
 * enough, and keeps these tests about our own boundary rather than about Next.
 */
const request = (path: string) =>
  ({
    nextUrl: new URL(path, "http://localhost:5100"),
    url: `http://localhost:5100${path}`,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * `NextMiddleware`'s second parameter. Unused by the mocked
 * clerkMiddleware and by proxy.ts itself, but the exported type still
 * requires one argument per position.
 */
const event = {} as never;

describe("isApiRoute", () => {
  it("matches the actor-mirror endpoint", () => {
    expect(isApiRoute(request("/api/actors/mine"))).toBe(true);
  });

  it("matches the bare /api and /trpc roots", () => {
    expect(isApiRoute(request("/api"))).toBe(true);
    expect(isApiRoute(request("/trpc"))).toBe(true);
  });

  it("matches a route nested under /trpc", () => {
    expect(isApiRoute(request("/trpc/x"))).toBe(true);
  });

  // The whole point of this test file: "/(api|trpc)(.*)" has no path
  // separator, so it also matches anything that merely *starts* with those
  // letters. A match here skips locale negotiation entirely (see proxy.ts),
  // so an over-broad pattern would silently stop `/apidocs` from getting a
  // `/es` prefix and a locale cookie — found by curling a running dev server,
  // not by reading the pattern.
  it("does not match a page path that merely starts with api or trpc", () => {
    expect(isApiRoute(request("/apidocs"))).toBe(false);
    expect(isApiRoute(request("/apikeys"))).toBe(false);
    expect(isApiRoute(request("/api-keys"))).toBe(false);
    expect(isApiRoute(request("/trpcx"))).toBe(false);
  });

  // A locale-prefixed API path should never occur in practice — the proxy
  // skips the intl middleware for API routes precisely so this never gets
  // produced — but the boundary is still the path separator, not a prefix
  // search, so this stays false rather than accidentally true.
  it("does not match a locale-prefixed API path", () => {
    expect(isApiRoute(request("/es/api/actors/mine"))).toBe(false);
  });

  // "api" appearing inside a page path must not trip the boundary either.
  it("does not match a page path that merely contains the word api", () => {
    expect(isApiRoute(request("/es/fursonas/rapid/edit"))).toBe(false);
  });
});

// isApiRoute being correct proves nothing about proxy.ts's default export:
// the `if (isApiRoute(request)) return;` line that actually reads it could
// vanish and every test above would stay green, because none of them ever
// call the middleware. This suite calls the real default export — through
// the clerkMiddleware stub above — so a deleted skip line or a reverted
// isApiRoute pattern shows up here, on the thing that ships, not just on the
// matcher underneath it.
describe("proxy (default export)", () => {
  it("skips the intl middleware for the actor-mirror endpoint", async () => {
    await proxy(request("/api/actors/mine"), event);
    expect(intlMiddleware).not.toHaveBeenCalled();
  });

  // /api/actors/mine is listed in PUBLIC_ROUTES precisely so auth.protect()
  // never runs for it — the route's own auth() check is the only gate. If
  // this reddens, the sibling PUBLIC_ROUTES entry regressed independently of
  // isApiRoute.
  it("does not call auth.protect for the actor-mirror endpoint", async () => {
    await proxy(request("/api/actors/mine"), event);
    expect(authProtect).not.toHaveBeenCalled();
  });

  it("runs the intl middleware for a locale-prefixed page and returns its result", async () => {
    const result = await proxy(request("/es/fursonas"), event);
    expect(intlMiddleware).toHaveBeenCalledTimes(1);
    expect(result).toBe("intl-response");
  });

  // Ties F1 and F2 together in one behavioural assertion: a path that merely
  // starts with "api" must reach the intl middleware through the real
  // default export, not just fail to match isApiRoute in isolation.
  it("runs the intl middleware for a page path that merely starts with api", async () => {
    await proxy(request("/apidocs"), event);
    expect(intlMiddleware).toHaveBeenCalledTimes(1);
  });
});
