/** A service whose player a fursona's page may frame. */
export type EmbedProvider = "youtube" | "vimeo" | "spotify" | "soundcloud";

/**
 * How tall a player wants to be.
 *
 * The renderer cannot ask the frame, and a cross-origin frame cannot tell it,
 * so the shape travels with the resolution instead of being guessed from the
 * provider at the call site.
 */
export type EmbedShape = "video" | "audio";

/** A player address this module built, and what it built it from. */
export interface ResolvedEmbed {
  /** Whose player it is. */
  provider: EmbedProvider;
  /** The address to frame. Always `https:`, always on the provider's host. */
  src: string;
  /** How tall the frame should be. */
  shape: EmbedShape;
}

/**
 * A YouTube video id.
 *
 * Exactly eleven of the URL-safe alphabet, which is what YouTube issues. The
 * length is part of the check rather than decoration: it is what stops a path
 * segment that merely looks like an id from being pasted into the address.
 */
const YOUTUBE_ID = /^[\w-]{11}$/;

/** A Vimeo video id — digits, and nothing else. */
const VIMEO_ID = /^\d+$/;

/** A Spotify id: base62, and no separator of any kind. */
const SPOTIFY_ID = /^[A-Za-z0-9]{16,32}$/;

/** One path segment of a SoundCloud address. */
const SOUNDCLOUD_SEGMENT = /^[\w-]{1,64}$/;

/** The Spotify resources that have an embeddable player. */
const SPOTIFY_KINDS = new Set([
  "track",
  "album",
  "playlist",
  "artist",
  "episode",
  "show",
]);

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
 * Resolves YouTube's several address forms to one video id.
 *
 * @param url - a parsed URL already known to be on a YouTube host.
 * @returns the video id, or null.
 */
function youtubeId(url: URL): string | null {
  const [first, second] = url.pathname.split("/").filter(Boolean);
  // youtu.be/<id> carries the id as the whole path; every youtube.com form
  // either names it in `v` or puts it after a segment naming the player.
  const candidate =
    url.hostname === "youtu.be"
      ? first
      : first === "watch"
        ? (url.searchParams.get("v") ?? "")
        : ["shorts", "embed", "live", "v"].includes(first ?? "")
          ? second
          : "";
  return YOUTUBE_ID.test(candidate ?? "") ? (candidate as string) : null;
}

/**
 * Resolves a Vimeo address to one video id.
 *
 * @param url - a parsed URL already known to be on a Vimeo host.
 * @returns the video id, or null.
 */
function vimeoId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  // player.vimeo.com/video/<id> against vimeo.com/<id>: the id is the last
  // segment either way, and everything that is not all-digits is refused.
  const candidate = parts[parts.length - 1] ?? "";
  return VIMEO_ID.test(candidate) ? candidate : null;
}

/**
 * Resolves a Spotify address to a kind and an id.
 *
 * @param url - a parsed URL already known to be on Spotify's host.
 * @returns the embed path, or null.
 */
function spotifyPath(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  // Shared links carry the country as `intl-es` ahead of the kind.
  const rest = parts[0]?.startsWith("intl-") ? parts.slice(1) : parts;
  const [kind, id] = rest;
  if (!kind || !id) return null;
  // The kind is interpolated into an address this module assembles, so it must
  // come from the allowlist rather than from the string — and the id must
  // carry no separator, or `track/aaa/../../evil` walks out of the path.
  if (!SPOTIFY_KINDS.has(kind) || !SPOTIFY_ID.test(id)) return null;
  return `${kind}/${id}`;
}

/**
 * Rebuilds a canonical SoundCloud track address.
 *
 * @param url - a parsed URL already known to be on SoundCloud's host.
 * @returns the canonical `https://soundcloud.com/…` address, or null.
 */
function soundcloudUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  // A bare profile has one segment and no player. A track has two; a set has
  // three, the middle one literally `sets`.
  const shape =
    parts.length === 2 || (parts.length === 3 && parts[1] === "sets");
  if (!shape || !parts.every((part) => SOUNDCLOUD_SEGMENT.test(part))) {
    return null;
  }
  return `https://soundcloud.com/${parts.join("/")}`;
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
 *   * SoundCloud is the one provider whose player takes an address as a
 *     parameter. That inner address is rebuilt from the parsed path segments
 *     and then encoded, so a `&` in what somebody pasted cannot add parameters
 *     to the widget.
 *
 * Returning null is an ordinary outcome and the caller must have somewhere to
 * put it: the renderer shows the item as a plain link instead. An address that
 * silently rendered nothing would leave somebody staring at a gap with no way
 * to learn their link was not one this hub can play.
 *
 * @param raw - the address somebody pasted, which may be anything at all.
 * @returns the player to frame, or null when there is none.
 */
export function resolveEmbed(raw: string | undefined): ResolvedEmbed | null {
  const url = raw ? parse(raw.trim()) : null;
  // Checked before the host, because a `javascript:` URL parses fine and its
  // `hostname` is empty — the scheme is the thing that makes it dangerous.
  if (!url || url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^(www|m)\./, "");

  if (host === "youtube.com" || host === "youtu.be") {
    const id = youtubeId(url);
    return id
      ? {
          provider: "youtube",
          src: `https://www.youtube-nocookie.com/embed/${id}`,
          shape: "video",
        }
      : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = vimeoId(url);
    return id
      ? {
          provider: "vimeo",
          src: `https://player.vimeo.com/video/${id}`,
          shape: "video",
        }
      : null;
  }

  if (host === "open.spotify.com") {
    const path = spotifyPath(url);
    return path
      ? {
          provider: "spotify",
          src: `https://open.spotify.com/embed/${path}`,
          shape: "audio",
        }
      : null;
  }

  if (host === "soundcloud.com") {
    const track = soundcloudUrl(url);
    return track
      ? {
          provider: "soundcloud",
          src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}`,
          shape: "audio",
        }
      : null;
  }

  return null;
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
