import { describe, expect, it } from "vitest";
import { isPublicRoute } from "@/lib/public-routes";

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

  // `/sign-in(.*)` matches any path merely *starting* with "/sign-in", so a
  // future /sign-in-admin route would be public without anyone deciding it.
  // The boundary has to be the path separator, not the prefix.
  it("does not make every route starting with sign-in public", () => {
    expect(isPublicRoute(request("/sign-instead"))).toBe(false);
    expect(isPublicRoute(request("/sign-in-admin"))).toBe(false);
  });
});
