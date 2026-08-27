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
 *
 * **The kind travels now, and it used to be discarded.** A resolver already
 * worked out whether an address named an album, a song or a track in order to
 * build the URL, and then threw that away — so the height came from the shape,
 * and one number per shape cannot say 450 for an album and 175 for a song.
 * That is exactly what put a 450px player in a 168px box.
 */
export interface ResolvedEmbed {
  /** Whose player it is. */
  provider: EmbedProviderId;
  /** The address to frame. Always `https:`, always on the provider's host. */
  src: string;
  /**
   * How wide the frame may be, and what height it falls back to.
   *
   * Usually the provider's own, and occasionally the ADDRESS's: Apple Music
   * serves a music video from the same host as an album, and that one is a
   * 16∶9 video rather than a player card. See `EmbedResolution.shape`.
   */
  shape: EmbedShape;
  /**
   * The origin the frame is loaded from, and the only origin a height message
   * about it may come from.
   *
   * **Carried on the resolution rather than looked up again in the browser.**
   * The frame is a client component and the table is server data; passing the
   * one string it needs keeps the whole provider table out of the bundle, and
   * keeps the origin a frame is checked against the same value `frame-src`
   * allowed it to load from — one table entry, read once.
   */
  origin: string;
  /**
   * How tall the provider paints, in CSS pixels, or null when it fills.
   *
   * **Server-rendered, so it is what a reader sees before any script runs and
   * what they keep if none ever does.** A provider that reports its own height
   * refines this in the browser; a provider that says nothing never does, and
   * this measured number is the whole answer for it.
   */
  height: number | null;
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
 * **It also answers how tall the player paints, and that answer never touches
 * the address.** A height is a number read out of a measured table or, later
 * and only in the browser, out of a message the framed provider sent — it is
 * applied to the frame's box and to nothing else. No branch anywhere lets a
 * height reach `src`, which is what keeps the paragraph above true regardless
 * of what a frame says about itself once it has loaded.
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

  const resolution = provider.resolve(url);
  return resolution
    ? {
        provider: provider.id,
        src: provider.src(resolution.value, options?.parentHost ?? ""),
        // The address may override the shape where the provider serves more
        // than one kind of thing — Apple Music's music videos are the case —
        // and otherwise the provider's own shape stands.
        shape: resolution.shape ?? provider.shape,
        origin: provider.origin,
        height: resolution.height,
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

/**
 * A CSS `url("…")` value built from a pasted address, or `undefined` when
 * the address must not be trusted with one.
 *
 * **A second refusal on top of `safeHttpUrl`'s own, scoped to what THIS
 * function does with the result.** `safeHttpUrl` rules out a scheme that could
 * execute something; that alone is not enough here, because this value gets
 * interpolated into a double-quoted CSS string. `safeHttpUrl`'s WHATWG
 * normalisation percent-encodes a stray `"` in a path or query, but **leaves
 * one in the HOST untouched** — confirmed directly:
 * `new URL('https://ex"ample.test/a.png').toString()` keeps the quote
 * verbatim. An address whose serialised form still contains a `"` would
 * therefore close the CSS string early, so it is refused outright here,
 * before this function ever builds a value from it.
 *
 * **A backslash is refused for the identical reason, and normalisation does
 * not help here either.** A stray `\` surviving in the query or fragment —
 * `new URL('https://example.test/?x\\').toString()` keeps it verbatim, the
 * same untouched-by-percent-encoding gap the host quote has — sits directly
 * before the closing `"` this function appends, so the built value ends
 * `…\"`, which CSS reads as an ESCAPED quote rather than the string's own
 * closing one: the string never closes, and everything after is appended to
 * it. Nothing downstream is exploitable today only because everything after
 * that point happens to be app-generated, which is ordering, not a
 * guarantee — the same trap this function exists to close for the host
 * quote.
 *
 * **This refusal exists independently of whichever sink renders the
 * result.** A browser's CSSOM happens to reject a malformed `style`
 * declaration today, which is why nothing is exploitable yet through
 * `blockStyle`'s own `style` object — but that is defence in depth, not
 * the reason this is safe. `themeCss`, in this feature's
 * `presentation/theme-css.ts`, interpolates a value into a raw `<style>` block, which gets no such
 * protection for free; a value trusted only because of where it currently
 * lands is a trap for whichever sink reuses it next. Refusing the quote by
 * construction, here, is what makes the returned value safe in ANY CSS
 * context.
 *
 * **Lives in `embeds.ts` rather than beside a caller**, and the reason changed
 * on 2026-08-27 when `themeVars` moved to `presentation/theme-css.ts`. It used
 * to be that its callers sat on opposite sides of the domain/presentation
 * boundary; they do not any more — `blockStyle`, `themeVars` and the block
 * renderers are all presentation now. What keeps it here is the other half of
 * the original argument, which did not move: **the refusal is a SAFETY rule,
 * not a styling one**, and it belongs beside `safeHttpUrl`, which it already
 * depends on. Three presentation callers sharing one function is also what
 * stops a second, narrower copy growing for the same job.
 *
 * @param url - the address an author pasted, or `undefined` when they left
 *   it unset.
 * @returns a `url("…")` value safe to interpolate into a CSS declaration, or
 *   `undefined` when the address is absent, not http(s), or would break out
 *   of its own quoting.
 */
export function backgroundImageValue(
  url: string | undefined,
): string | undefined {
  const href = safeHttpUrl(url);
  return href && !/["\\]/.test(href) ? `url("${href}")` : undefined;
}
