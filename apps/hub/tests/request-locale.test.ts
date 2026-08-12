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
      "http://localhost:5100/en/sign-in",
    );
    expect(signInUrlFor("/es/me", BASE)).toBe(
      "http://localhost:5100/es/sign-in",
    );
  });

  it("uses the default locale when the path carries none", () => {
    expect(signInUrlFor("/me", BASE)).toBe(
      `http://localhost:5100/${routing.defaultLocale}/sign-in`,
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
});
