import { safeHttpUrl } from "@/features/actors/domain/embeds";

/**
 * A service this app can recognise by name.
 *
 * `handleAt` and `skip` both index into the URL's path segments — `skip`
 * drops a matching leading routing prefix first, so a service that serves
 * both a prefixed and a bare profile URL (Patreon's `/c/`, YouTube's
 * `/channel/`) needs only one entry for both.
 */
export interface SocialBrand {
  /** What to call it on the chip. */
  label: string;
  /**
   * A lucide icon name, or undefined for the generic one.
   *
   * **These are category glyphs, not brand marks, and that is forced.** The
   * installed lucide has no `Instagram`, `Twitter`, `Github`, `Twitch` or
   * `Youtube` — its brand set was removed — so a camera stands for a photo
   * service, a paw for a fandom one, a palette for an art one. Verified
   * against the installed package; a name lucide does not have renders as
   * nothing, which is a chip with a hole in it.
   *
   * **Never use lucide's `X` for X/Twitter.** It exists, and it is the
   * close/dismiss cross — putting it on somebody's profile link would render a
   * "delete" glyph beside their name.
   */
  icon?: string;
  /**
   * Which path segment holds the handle, counting from zero, after
   * {@link SocialBrand.skip} has dropped its prefix.
   *
   * `undefined` means the service has no handle worth showing. A number rather
   * than a function because every service here puts it in a fixed position,
   * and a callback per brand would be a place for one of them to throw.
   */
  handleAt?: number;
  /**
   * Leading path segments to drop before {@link SocialBrand.handleAt} counts.
   *
   * Several services route their profiles under a fixed prefix —
   * `patreon.com/c/<creator>`, `youtube.com/channel/<id>` — while also serving
   * the bare form. Dropping the prefix, when the first segment matches one of
   * these, lets one entry cover both instead of yielding the prefix word
   * itself as the "handle".
   */
  skip?: readonly string[];
}

/** A chip the `socials` layout can render. */
export interface ResolvedSocial {
  /** The service's name, or the bare hostname when unrecognised. */
  label: string;
  /** A lucide icon name, when there is a fitting one. */
  icon?: string;
  /** The handle, `@`-prefixed, when the address carries one. */
  handle?: string;
  /** The address to link to — exactly what was pasted, once validated. */
  href: string;
}

/**
 * Hosts this app can name, keyed by the hostname with `www.` stripped.
 *
 * A `Map` and not an object literal: it is looked up with a hostname taken
 * from a pasted address, and a plain object would return inherited members for
 * `__proto__`, `constructor` and friends — which shipped a crash in Phase A.
 *
 * Adding a service is one entry. Getting it wrong costs nothing: an
 * unrecognised host still renders, labelled with its own hostname.
 */
const BRANDS = new Map<string, SocialBrand>([
  ["instagram.com", { label: "Instagram", icon: "camera", handleAt: 0 }],
  ["x.com", { label: "X", icon: "message-circle", handleAt: 0 }],
  ["twitter.com", { label: "X", icon: "message-circle", handleAt: 0 }],
  // t.me/s/<channel> is Telegram's web-preview form of the same channel.
  ["t.me", { label: "Telegram", icon: "send", handleAt: 0, skip: ["s"] }],
  ["pinterest.com", { label: "Pinterest", icon: "pin", handleAt: 0 }],
  // bsky.app/profile/<handle>/… — the handle is the SECOND segment.
  ["bsky.app", { label: "Bluesky", icon: "cloud", handleAt: 1 }],
  ["furaffinity.net", { label: "FurAffinity", icon: "paw-print", handleAt: 1 }],
  // weasyl.com/~<username> — a single segment, tilde-prefixed.
  ["weasyl.com", { label: "Weasyl", icon: "paw-print", handleAt: 0 }],
  ["toyhou.se", { label: "Toyhouse", icon: "paw-print", handleAt: 0 }],
  ["ko-fi.com", { label: "Ko-fi", icon: "coffee", handleAt: 0 }],
  // patreon.com/c/<creator> is the current form; patreon.com/<creator> still
  // works and is caught by the bare handleAt: 0 once "c" is skipped.
  [
    "patreon.com",
    { label: "Patreon", icon: "heart", handleAt: 0, skip: ["c"] },
  ],
  ["deviantart.com", { label: "DeviantArt", icon: "palette", handleAt: 0 }],
  ["artstation.com", { label: "ArtStation", icon: "palette", handleAt: 0 }],
  ["github.com", { label: "GitHub", icon: "code", handleAt: 0 }],
  ["twitch.tv", { label: "Twitch", icon: "tv", handleAt: 0 }],
  // youtube.com/@<handle> is current; /c/, /user/ and /channel/ are all
  // still-live legacy prefixes that must not be read as the handle itself.
  [
    "youtube.com",
    {
      label: "YouTube",
      icon: "video",
      handleAt: 0,
      skip: ["c", "user", "channel"],
    },
  ],
  ["soundcloud.com", { label: "SoundCloud", icon: "music", handleAt: 0 }],
  ["vimeo.com", { label: "Vimeo", icon: "clapperboard", handleAt: 0 }],
  ["mastodon.social", { label: "Mastodon", icon: "at-sign", handleAt: 0 }],
  ["meow.social", { label: "Mastodon", icon: "at-sign", handleAt: 0 }],
  ["furry.engineer", { label: "Mastodon", icon: "at-sign", handleAt: 0 }],
  // Regression: pawb.social was branded "Mastodon" here on the assumption
  // that a Mastodon-shaped host runs Mastodon software. It does not — its own
  // /nodeinfo/2.1 names "software":{"name":"lemmy"} — verified while checking
  // Phase B's Mastodon roster (2026-08-16), where the same assumption would
  // have shipped a sixth post-embed provider that 404s. Lemmy communities and
  // profiles route through /c/ and /u/, which is why it needs the same `skip`
  // Patreon's /c/ and YouTube's /channel|c|user/ already use.
  [
    "pawb.social",
    { label: "Lemmy", icon: "layers", handleAt: 0, skip: ["c", "u"] },
  ],
]);

/**
 * Turns a pasted address into a chip the socials layout can render.
 *
 * **Unlike {@link resolveEmbed}, this accepts anything linkable.** A host in
 * the table becomes a named chip with its handle; a host outside it becomes a
 * chip labelled with its own hostname. That is what lets one layout cover the
 * whole of somebody's presence — including services that publish no embed and
 * never will — with no entry required and nothing to break.
 *
 * `http:` is allowed where a frame would refuse it, for the reason
 * `safeHttpUrl` gives: a plain link is the person's own choice of destination
 * and parts of this fandom's web have never had a certificate.
 *
 * The handle is read from the parsed path segments per {@link SocialBrand},
 * after a leading `skip` prefix is dropped, and a leading `@` or `~` already
 * in that segment is never doubled.
 *
 * @param raw - the address somebody pasted, which may be anything at all.
 * @returns the chip, or null when the address must not be linked at all.
 */
export function resolveSocial(raw: string | undefined): ResolvedSocial | null {
  const href = safeHttpUrl(raw);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, "");
  const brand = BRANDS.get(host);
  const segments = url.pathname.split("/").filter(Boolean);
  // Drop a leading routing prefix — "c", "channel", "s" — before handleAt
  // counts, so a prefixed and a bare profile URL resolve to the same segment.
  const indexed = brand?.skip?.includes(segments[0] ?? "")
    ? segments.slice(1)
    : segments;
  const segment =
    brand?.handleAt === undefined ? undefined : indexed[brand.handleAt];
  return {
    label: brand?.label ?? host,
    icon: brand?.icon,
    // Some services already carry `@` or `~` in the path; do not double it.
    handle: segment ? `@${segment.replace(/^[@~]/, "")}` : undefined,
    href,
  };
}
