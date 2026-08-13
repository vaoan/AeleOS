import { describe, expect, it } from "vitest";
import {
  localeFromPathname,
  signInUrlFor,
} from "@/shared/infrastructure/request-locale";
import { routing } from "@/shared/infrastructure/i18n/routing";

const BASE = "http://localhost:5100/whatever";

describe("localeFromPathname", () => {
  it("reads a supported locale prefix", () => {
    expect(localeFromPathname("/es/me")).toBe("es");
    expect(localeFromPathname("/en/me")).toBe("en");
  });

  it("reads a bare locale path", () => {
    expect(localeFromPathname("/en")).toBe("en");
  });

  // The segment comes from the URL, so it is attacker-controlled. It must
  // never be echoed back into a redirect.
  it("falls back to the default for an unsupported prefix", () => {
    expect(localeFromPathname("/fr/me")).toBe(routing.defaultLocale);
    expect(localeFromPathname("/clerk_1786513644585/me")).toBe(
      routing.defaultLocale,
    );
  });

  it("falls back to the default for an unprefixed path", () => {
    expect(localeFromPathname("/me")).toBe(routing.defaultLocale);
    expect(localeFromPathname("/")).toBe(routing.defaultLocale);
    expect(localeFromPathname("")).toBe(routing.defaultLocale);
  });
});

describe("signInUrlFor", () => {
  it("keeps the visitor in the language they were already browsing", () => {
    expect(signInUrlFor("/en/me", BASE)).toBe(
      "http://localhost:5100/en/sign-in?redirect_url=%2Fen%2Fme",
    );
    expect(signInUrlFor("/es/me", BASE)).toBe(
      "http://localhost:5100/es/sign-in?redirect_url=%2Fes%2Fme",
    );
  });

  it("uses the default locale when the path carries none", () => {
    expect(signInUrlFor("/me", BASE)).toBe(
      `http://localhost:5100/${routing.defaultLocale}/sign-in?redirect_url=%2Fme`,
    );
  });

  // Without this the redirect target could be pointed at another origin by a
  // crafted first segment.
  it("never produces a URL on another origin", () => {
    for (const path of ["/fr/me", "//evil.example.com/me", "/..%2F/me"]) {
      expect(new URL(signInUrlFor(path, BASE)).origin).toBe(
        "http://localhost:5100",
      );
    }
  });

  // The picker's whole point: whoever was headed to `/es/picker?app=Puck` and
  // hit the auth gate must land back there once signed in, not on `/me`.
  it("appends the original path and query as a single redirect_url", () => {
    expect(signInUrlFor("/es/picker", BASE, "?return_to=x&app=Puck")).toBe(
      "http://localhost:5100/es/sign-in?redirect_url=%2Fes%2Fpicker%3Freturn_to%3Dx%26app%3DPuck",
    );
  });

  // There is nowhere useful to send someone back to the root for, and every
  // visitor already lands on their profile by default.
  it("omits redirect_url when the destination is just /", () => {
    expect(signInUrlFor("/", BASE)).toBe(
      `http://localhost:5100/${routing.defaultLocale}/sign-in`,
    );
  });
});
