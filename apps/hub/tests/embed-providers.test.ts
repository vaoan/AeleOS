import { describe, expect, it } from "vitest";
import {
  EMBED_PROVIDERS,
  findProvider,
  providerOrigins,
} from "@/shared/domain/embed-providers";

describe("EMBED_PROVIDERS", () => {
  it("gives every provider at least one host", () => {
    for (const provider of EMBED_PROVIDERS) {
      expect(provider.hosts.length).toBeGreaterThan(0);
    }
  });

  it("declares an https origin for every provider", () => {
    for (const provider of EMBED_PROVIDERS) {
      expect(provider.origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    }
  });

  it("claims no host twice", () => {
    const seen = EMBED_PROVIDERS.flatMap((provider) => [...provider.hosts]);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("findProvider", () => {
  it("finds a provider by an exact host", () => {
    expect(findProvider("youtu.be")?.id).toBe("youtube");
  });

  // The whole security model in one assertion: a host is matched exactly,
  // never by prefix or suffix, so a lookalike domain resolves to nothing.
  it.each([
    "youtube.com.evil.example",
    "evil-youtube.com",
    "notspotify.com",
    "",
  ])("refuses %s", (host) => {
    expect(findProvider(host)).toBeNull();
  });
});

describe("providerOrigins", () => {
  it("returns each origin exactly once", () => {
    const origins = providerOrigins();
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("covers every provider in the table", () => {
    for (const provider of EMBED_PROVIDERS) {
      expect(providerOrigins()).toContain(provider.origin);
    }
  });
});
