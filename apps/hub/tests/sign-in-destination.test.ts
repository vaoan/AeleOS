import { describe, expect, it } from "vitest";
import { resolveAfterSignInUrl } from "@/shared/infrastructure/request-locale";

describe("resolveAfterSignInUrl", () => {
  it("returns the requested internal destination", () => {
    expect(resolveAfterSignInUrl("/es/picker?return_to=x", "es")).toBe(
      "/es/picker?return_to=x",
    );
  });

  it("falls back to the profile when nothing was requested", () => {
    expect(resolveAfterSignInUrl(null, "es")).toBe("/es/me");
    expect(resolveAfterSignInUrl("", "en")).toBe("/en/me");
  });

  // The whole point. A destination arriving in a query string is attacker
  // input, and sending someone to it after authenticating is the classic
  // post-login open redirect.
  it("falls back rather than leaving this origin", () => {
    for (const bad of [
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example/x",
      "javascript:alert(1)",
      "picker",
    ]) {
      expect(resolveAfterSignInUrl(bad, "es")).toBe("/es/me");
    }
  });

  // Next reports a repeated query key (`?redirect_url=a&redirect_url=b`) as
  // an array, not a string — `searchParamsToUrlQuery`'s doing, invisible from
  // the page's own narrower type. A caller that only typed the string case
  // handed this an array live and got `TypeError: candidate.startsWith is
  // not a function`, a 500 on the one page that must never fail to render.
  // Typed `unknown` and narrowed with `typeof` so that promise holds no
  // matter what a caller's own type declares.
  it("falls back for anything that is not a string", () => {
    for (const bad of [
      ["/es/me", "/es/other"],
      42,
      { path: "/es/me" },
      true,
      undefined,
    ]) {
      expect(resolveAfterSignInUrl(bad, "es")).toBe("/es/me");
    }
  });

  // Same-origin, so isInternalPath is right to allow it — but landing someone
  // freshly signed in back on the sign-in page shows them provider buttons
  // for a session that already exists. A product rule, not a security one.
  it("falls back rather than sending someone back to the sign-in page", () => {
    expect(resolveAfterSignInUrl("/es/sign-in", "es")).toBe("/es/me");
    expect(resolveAfterSignInUrl("/es/sign-in/", "es")).toBe("/es/me");
    expect(resolveAfterSignInUrl("/en/sign-in?foo=1", "en")).toBe("/en/me");
  });
});
