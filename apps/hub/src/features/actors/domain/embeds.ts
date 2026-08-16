export { PLAYER_ORIGINS } from "@/shared/domain/player-origins";
export type { EmbedShape } from "@/shared/domain/embed-providers";

import { findProvider } from "@/shared/domain/embed-providers";
import type {
  EmbedProviderId,
  EmbedShape,
} from "@/shared/domain/embed-providers";

/**
 * A player address this module built, and what it built it from.
 *
 * `provider` is an {@link EmbedProviderId} — the union that used to be named
 * `EmbedProvider`, before that name was claimed by the table-entry interface
 * in `@/shared/domain/embed-providers`.
 */
export interface ResolvedEmbed {
  /** Whose player it is. */
  provider: EmbedProviderId;
  /** The address to frame. Always `https:`, always on the provider's host. */
  src: string;
  /** How tall the frame should be. */
  shape: EmbedShape;
}

/** What {@link resolveEmbed} needs beyond the address. */
export interface ResolveEmbedOptions {
  /**
   * This deployment's hostname, for the one provider that demands it.
   *
   * Twitch's player refuses to load unless `parent=` names the embedding
   * domain. Absent means Twitch resolves to null and the caller renders a
   * link — never a frame that would load an error.
   */
  parentHost?: string;
}

/**
 * Parses a URL, or gives up.
 *
 * `URL` throws on anything it cannot parse, and this module is fed whatever
 * somebody pasted — so the throw is an ordinary outcome here, not a fault.
 *
 * @param raw - what somebody pasted.
 * @returns the parsed URL, or null.
 */
function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Turns a pasted address into a player this page is willing to frame.
 *
 * **The returned `src` is never the string that was passed in.** Every branch
 * parses the address, checks the host against an exact allowlist, extracts an
 * identifier that matches a strict pattern, and then BUILDS a new address from
 * a fixed template. That is the whole security model of the media layouts, and
 * it is why a hostile value cannot become anything worse than no embed:
 *
 *   * A scheme other than `https:` never survives, so `javascript:` and
 *     `data:` cannot reach a frame and run in this page's origin.
 *   * Hosts are compared to a set on the PARSED `hostname`, never by prefix or
 *     suffix — `youtube.com.evil.example`, `evil-youtube.com` and
 *     `https://www.youtube.com@evil.example` all fail, which the last one only
 *     does because the comparison is on the parsed authority.
 *   * Every query parameter on the pasted address is discarded. Carrying them
 *     over would let whoever pasted the link set whatever options the provider
 *     happens to honour.
 *   * Any provider whose player takes an address as a parameter rebuilds it
 *     from the parsed path segments and then encodes it, so a `&` in what
 *     somebody pasted cannot add parameters to the widget. SoundCloud and
 *     Mixcloud both do — the URL-inside-a-URL case is not unique to one
 *     provider, and a third provider shaped this way inherits the same rule.
 *   * Twitch is the one provider whose player needs configuration nobody
 *     typed: `parent=` must name the domain doing the embedding, or Twitch
 *     refuses to load. That can only come from `options.parentHost`, never
 *     from the pasted address, so Twitch resolves to null without it rather
 *     than framing a player guaranteed to error.
 *
 * Returning null is an ordinary outcome and the caller must have somewhere to
 * put it: the renderer shows the item as a plain link instead. An address that
 * silently rendered nothing would leave somebody staring at a gap with no way
 * to learn their link was not one this hub can play.
 *
 * **The branches are a table now.** `EMBED_PROVIDERS` holds one entry per
 * service and this function is the lookup; the guarantees above are properties
 * of every entry rather than of a chain somebody has to read to the end.
 *
 * @param raw - the address somebody pasted, which may be anything at all.
 * @param options - {@link ResolveEmbedOptions}. Twitch is the only provider
 * that reads `parentHost`; every other provider ignores it.
 * @returns the player to frame, or null when there is none.
 */
export function resolveEmbed(
  raw: string | undefined,
  options?: ResolveEmbedOptions,
): ResolvedEmbed | null {
  const url = raw ? parse(raw.trim()) : null;
  // Checked before the host, because a `javascript:` URL parses fine and its
  // `hostname` is empty — the scheme is what makes it dangerous.
  if (!url || url.protocol !== "https:") return null;

  const provider = findProvider(url.hostname.replace(/^(www|m)\./, ""));
  if (!provider) return null;

  // Twitch is the only provider that cannot be built without knowing where it
  // will be embedded. Refusing here rather than building a broken address is
  // what routes it to the link fallback.
  if (provider.id === "twitch" && !options?.parentHost) return null;

  const value = provider.resolve(url);
  return value
    ? {
        provider: provider.id,
        src: provider.src(value, options?.parentHost ?? ""),
        shape: provider.shape,
      }
    : null;
}

/**
 * Accepts an address only if it is safe to put in an `href`.
 *
 * The `links` layout renders whatever somebody pasted as a button, and an
 * `href` is every bit as dangerous as a frame's `src`: `javascript:` in one
 * runs script in this page's origin exactly as it would in the other. React
 * escapes text, not URL schemes, so nothing upstream is catching this.
 *
 * Only `http:` and `https:` survive. That is an allowlist rather than a list of
 * schemes to reject, because the dangerous set is open-ended — `javascript:`,
 * `data:`, `vbscript:`, and whatever a browser ships next — while the set worth
 * allowing is two entries long and not growing.
 *
 * `http:` is allowed where {@link resolveEmbed} refuses it. A plain link is the
 * person's own choice of destination and some of the fandom's older sites have
 * never had a certificate; a framed player is content executing inside the page
 * and has no such excuse.
 *
 * @param raw - the address somebody pasted, which may be anything at all.
 * @returns the address, or null when it must not be linked.
 */
export function safeHttpUrl(raw: string | undefined): string | null {
  const url = raw ? parse(raw.trim()) : null;
  if (!url) return null;
  return url.protocol === "https:" || url.protocol === "http:"
    ? url.toString()
    : null;
}
