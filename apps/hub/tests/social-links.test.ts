import { describe, expect, it } from "vitest";
import { resolveSocial } from "@/features/actors/domain/social-links";

describe("resolveSocial", () => {
  it("brands a known host and pulls out the handle", () => {
    expect(resolveSocial("https://www.instagram.com/luna.fox")).toMatchObject({
      label: "Instagram",
      handle: "@luna.fox",
    });
  });

  it("keeps the pasted address as the href", () => {
    expect(resolveSocial("https://furaffinity.net/user/luna")?.href).toBe(
      "https://furaffinity.net/user/luna",
    );
  });

  // The whole point of the layout: an unknown host is still a usable chip.
  it("falls back to the hostname for a host it does not know", () => {
    const chip = resolveSocial("https://some-artist-site.example/luna");
    expect(chip?.label).toBe("some-artist-site.example");
    expect(chip?.handle).toBeUndefined();
  });

  it("strips www. from a fallback label", () => {
    expect(resolveSocial("https://www.example.com/x")?.label).toBe(
      "example.com",
    );
  });

  // "instagram.com.evil.example" is the PREFIX shape: the real brand's host
  // leads the string, with an attacker's suffix tacked on. "evil-instagram.com"
  // and "sub.t.me" are the SUFFIX shape: the real brand's host trails the
  // string, which is exactly what `host.endsWith(brand)` would accept — the
  // "improvement" `apps/hub/src/features/actors/CLAUDE.md` warns against by
  // name, and the one this suite did not previously catch. Every case must
  // fall through to a hostname-labelled chip with no brand and no icon.
  it.each([
    "instagram.com.evil.example",
    "evil-instagram.com",
    "evil-weasyl.com",
    "evil-x.com",
    "sub.t.me",
  ])(
    "brands a host by exact match, never by suffix or subdomain: %s",
    (host) => {
      const chip = resolveSocial(`https://${host}/luna`);
      expect(chip?.label).toBe(host);
      expect(chip?.icon).toBeUndefined();
    },
  );

  it("accepts http, which a frame may not", () => {
    expect(resolveSocial("http://oldsite.example/luna")).not.toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "not a url", undefined])(
    "refuses %s",
    (raw) => {
      expect(resolveSocial(raw)).toBeNull();
    },
  );

  it("gives a profile with no handle segment no handle", () => {
    expect(resolveSocial("https://www.instagram.com/")?.handle).toBeUndefined();
  });

  // Regression: Weasyl profiles are a single tilde-prefixed segment
  // (weasyl.com/~username). handleAt: 1 silently produced no handle at all.
  it("weasyl: strips the tilde from a profile handle", () => {
    expect(resolveSocial("https://www.weasyl.com/~luna")?.handle).toBe("@luna");
  });

  // Regression: Patreon's current creator URL is patreon.com/c/<creator>;
  // handleAt: 0 alone produced "@c" — the prefix word, not the person.
  it("patreon: reads the handle from the /c/-prefixed form", () => {
    expect(resolveSocial("https://www.patreon.com/c/luna")?.handle).toBe(
      "@luna",
    );
  });

  it("patreon: still reads the legacy bare form", () => {
    expect(resolveSocial("https://www.patreon.com/luna")?.handle).toBe("@luna");
  });

  // Regression: youtube.com/channel/<id> produced "@channel" without a skip.
  it("youtube: reads the handle from the current @ form", () => {
    expect(resolveSocial("https://www.youtube.com/@luna")?.handle).toBe(
      "@luna",
    );
  });

  it("youtube: skips the /c/ prefix", () => {
    expect(resolveSocial("https://www.youtube.com/c/luna")?.handle).toBe(
      "@luna",
    );
  });

  it("youtube: skips the /user/ prefix", () => {
    expect(resolveSocial("https://www.youtube.com/user/luna")?.handle).toBe(
      "@luna",
    );
  });

  it("youtube: skips the /channel/ prefix", () => {
    expect(
      resolveSocial("https://www.youtube.com/channel/UCabc123")?.handle,
    ).toBe("@UCabc123");
  });

  // Regression: t.me/s/<channel> is Telegram's web-preview form and produced
  // "@s" without a skip.
  it("telegram: reads the handle from the /s/ preview form", () => {
    expect(resolveSocial("https://t.me/s/luna")?.handle).toBe("@luna");
  });

  it("telegram: still reads the bare form", () => {
    expect(resolveSocial("https://t.me/luna")?.handle).toBe("@luna");
  });

  // Branch coverage: a brand that HAS a `skip` list, given a bare host with
  // no path segments at all — segments[0] is undefined, not just non-"s".
  it("telegram: a bare host with no path segment has no handle", () => {
    expect(resolveSocial("https://t.me/")?.handle).toBeUndefined();
  });

  // Regression: pawb.social was branded "Mastodon" on the assumption that a
  // Mastodon-shaped host runs Mastodon software. Its own /nodeinfo/2.1 names
  // "software":{"name":"lemmy"} — found while verifying Phase B's Mastodon
  // roster, where the same wrong assumption would have shipped a sixth
  // post-embed provider that 404s on every address.
  it("pawb.social: brands as Lemmy, not Mastodon", () => {
    expect(resolveSocial("https://pawb.social/c/somecommunity")?.label).toBe(
      "Lemmy",
    );
  });

  it("pawb.social: reads a community handle from the /c/ prefix", () => {
    expect(resolveSocial("https://pawb.social/c/somecommunity")?.handle).toBe(
      "@somecommunity",
    );
  });

  it("pawb.social: reads a user handle from the /u/ prefix", () => {
    expect(resolveSocial("https://pawb.social/u/luna")?.handle).toBe("@luna");
  });

  // Regression class: BRANDS must stay a Map. A plain object literal indexed
  // with a user-controlled hostname returns truthy inherited members for
  // these names, which shipped a crash in Phase A — resolveSocial must
  // neither throw nor brand a chip for any of them.
  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  ])("does not throw or brand the dangerous hostname %s", (host) => {
    const raw = `https://${host}/luna`;
    expect(() => resolveSocial(raw)).not.toThrow();
    const chip = resolveSocial(raw);
    expect(chip).not.toBeNull();
    expect(chip?.icon).toBeUndefined();
    expect(chip?.label).toBe(host.toLowerCase());
  });
});
