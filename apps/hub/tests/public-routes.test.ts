import { describe, expect, it } from "vitest";
import { isPublicRoute } from "@/features/session/infrastructure/public-routes";
import { routing } from "@/shared/infrastructure/i18n/routing";

/**
 * Clerk's matcher reads the pathname off the request. A URL-bearing stub is
 * enough, and keeps these tests about our route list rather than about Next.
 */
const request = (path: string) =>
  ({
    nextUrl: new URL(path, "http://localhost:5100"),
    url: `http://localhost:5100${path}`,
  }) as never;

describe("isPublicRoute", () => {
  it("lets the marketing home through without a session", () => {
    expect(isPublicRoute(request("/"))).toBe(true);
  });

  it("lets the sign-in page through without a session", () => {
    expect(isPublicRoute(request("/sign-in"))).toBe(true);
  });

  it("lets Clerk's sign-in sub-routes through", () => {
    expect(isPublicRoute(request("/sign-in/sso-callback"))).toBe(true);
    expect(isPublicRoute(request("/sign-in/factor-one"))).toBe(true);
  });

  it("protects /me", () => {
    expect(isPublicRoute(request("/me"))).toBe(false);
  });

  it("protects a route nobody remembered to classify", () => {
    expect(isPublicRoute(request("/fursonas"))).toBe(false);
    expect(isPublicRoute(request("/admin"))).toBe(false);
  });

  // Public here does not mean "reachable without a session" — it means the
  // proxy's auth.protect() must not run, so its 307 never reaches a
  // server-to-server caller. The route's own auth() check answers 401 JSON
  // instead. See proxy.ts and app/api/actors/mine/route.ts.
  it("lets the actor-mirror endpoint past the proxy's own auth check", () => {
    expect(isPublicRoute(request("/api/actors/mine"))).toBe(true);
  });

  // A literal exact match, not a prefix: a later "generalisation" to
  // /api/(.*) would silently make every future API route public at the
  // proxy layer, with this suite still green unless this case is here to
  // catch it.
  it("does not treat every path under /api/actors/mine as public", () => {
    expect(isPublicRoute(request("/api/actors/mineral"))).toBe(false);
    expect(isPublicRoute(request("/api/actors/mine/extra"))).toBe(false);
  });

  // `/sign-in(.*)` matches any path merely *starting* with "/sign-in", so a
  // future /sign-in-admin route would be public without anyone deciding it.
  // The boundary has to be the path separator, not the prefix.
  it("does not make every route starting with sign-in public", () => {
    expect(isPublicRoute(request("/sign-instead"))).toBe(false);
    expect(isPublicRoute(request("/sign-in-admin"))).toBe(false);
  });

  // Locale prefixes are what the browser actually requests once next-intl has
  // redirected, so the unprefixed forms alone would lock every visitor out of
  // the very page they were sent to.
  it("lets each locale's home and sign-in through", () => {
    for (const locale of routing.locales) {
      expect(isPublicRoute(request(`/${locale}`))).toBe(true);
      expect(isPublicRoute(request(`/${locale}/sign-in`))).toBe(true);
      expect(isPublicRoute(request(`/${locale}/sign-in/sso-callback`))).toBe(
        true,
      );
    }
  });

  it("protects each locale's signed-in pages", () => {
    for (const locale of routing.locales) {
      expect(isPublicRoute(request(`/${locale}/me`))).toBe(false);
      expect(isPublicRoute(request(`/${locale}/fursonas`))).toBe(false);
    }
  });

  it("keeps the separator boundary inside a locale prefix too", () => {
    expect(isPublicRoute(request("/es/sign-instead"))).toBe(false);
    expect(isPublicRoute(request("/en/sign-in-admin"))).toBe(false);
  });

  // An unsupported locale must not become a way to reach protected pages.
  it("does not treat an unknown locale prefix as public", () => {
    expect(isPublicRoute(request("/fr/me"))).toBe(false);
    expect(isPublicRoute(request("/de"))).toBe(false);
  });
});
