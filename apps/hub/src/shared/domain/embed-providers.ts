/**
 * How tall a player wants to be.
 *
 * The renderer cannot ask the frame, and a cross-origin frame cannot tell it,
 * so the shape travels with the resolution rather than being guessed from the
 * provider at the call site. `portrait` is a phone-shaped frame — TikTok is
 * the only provider that asks for it, since a landscape frame would letterbox
 * a vertical video into a strip. `post` is none of the others: a social post's
 * height varies with how much its author wrote, so its frame is a fixed-height,
 * narrow column that scrolls its own content rather than an aspect ratio tuned
 * for a video or a player's controls.
 */
export type EmbedShape = "video" | "audio" | "portrait" | "post";

/**
 * The shape `EMBED_PROVIDERS`' entries are checked against.
 *
 * Not exported: it exists only so `EMBED_PROVIDERS` can be checked
 * structurally without mentioning `EmbedProviderId`, which is derived FROM
 * this table and so cannot appear in the type that constrains it. `id` is
 * `string` here for exactly that reason — the literal it narrows to at each
 * entry is what `EmbedProviderId` is built from.
 */
interface EmbedProviderDef {
  id: string;
  hosts: readonly string[];
  origin: string;
  shape: EmbedShape;
  resolve: (url: URL) => string | null;
  src: (value: string, parentHost: string) => string;
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
 * The id YouTube is being asked for, whichever of its four shapes was pasted.
 *
 * `youtu.be/ID`, `watch?v=ID`, and the `shorts` / `embed` / `live` / `v` path
 * forms. Written as four cases because it decides what this app will put in a
 * frame: nested ternaries hid which one a URL had fallen into, and the one that
 * matters most — an unrecognised shape yielding nothing — was the innermost.
 *
 * @param url - the parsed address.
 * @param first - its first path segment, if any.
 * @param second - its second, if any.
 * @returns the candidate id, which the caller still validates.
 */
function youtubeCandidate(
  url: URL,
  first: string | undefined,
  second: string | undefined,
): string | undefined {
  if (url.hostname === "youtu.be") return first;
  if (first === "watch") return url.searchParams.get("v") ?? "";
  if (["shorts", "embed", "live", "v"].includes(first ?? "")) return second;
  return "";
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
  // Four shapes, listed as four. Nested ternaries hid which one a URL fell
  // into, and this is the function that decides what may be framed.
  const candidate = youtubeCandidate(url, first, second);
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
  const candidate = parts.at(-1) ?? "";
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
  // `new URL()` normalises `..` segments during parsing, so
  // `track/aaa/../../evil` never reaches here as two path segments — it
  // arrives with a pathname of `/evil`, one segment, and this guard (`id` is
  // `undefined`) is what refuses it, before `SPOTIFY_KINDS` or `SPOTIFY_ID`
  // is ever consulted. Verified with `node -e`. `SPOTIFY_ID` still matters —
  // its alphabet and length are what an id must satisfy — but a `/` cannot
  // reach it: `pathname.split("/")` guarantees no segment holds one, and an
  // encoded `%2F` survives parsing still encoded, so it is the base62
  // alphabet rejecting `%` that refuses it, not a rule about separators.
  if (!kind || !id) return null;
  // The kind is interpolated into an address this module assembles, so it
  // must come from the allowlist rather than from the string.
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
 * A Dailymotion video id: 6-12 alphanumerics, case-insensitive.
 *
 * Deliberately loose rather than anchored to a leading character. Public ids
 * are `x`-prefixed, but private-video ids are `k`-prefixed — requiring `x`
 * would refuse valid, playable addresses for no security benefit, since the
 * value is only ever interpolated after this match, never trusted for
 * anything else.
 */
const DAILYMOTION_ID = /^[a-z0-9]{6,12}$/i;

/**
 * Resolves a Dailymotion address to one video id.
 *
 * `dailymotion.com/video/<id>` and the short `dai.ly/<id>` both carry the id as
 * the last segment, so one rule covers both.
 *
 * @param url - a parsed URL already known to be on a Dailymotion host.
 * @returns the video id, or null.
 */
function dailymotionId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate = parts.at(-1) ?? "";
  return DAILYMOTION_ID.test(candidate) ? candidate : null;
}

/** A TikTok video id: fifteen to twenty-five digits, and nothing else. */
const TIKTOK_ID = /^\d{15,25}$/;

/**
 * Resolves a TikTok address to one video id.
 *
 * The only shape with a player is `/@user/video/<id>`; a bare profile has no
 * embed and must resolve to null rather than to the profile page in a frame.
 *
 * @param url - a parsed URL already known to be on TikTok's host.
 * @returns the video id, or null.
 */
function tiktokId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const [handle, kind, id] = parts;
  if (!handle?.startsWith("@") || kind !== "video") return null;
  return TIKTOK_ID.test(id ?? "") ? (id as string) : null;
}

/** A two-letter storefront, which is the only country form Apple issues. */
const APPLE_COUNTRY = /^[a-z]{2}$/;

/** An Apple Music id: digits, or a `pl.`-prefixed playlist token. */
const APPLE_ID = /^(\d+|pl\.[A-Za-z0-9_-]{4,64})$/;

/** The Apple Music resources with an embeddable player. */
const APPLE_KINDS = new Set(["album", "playlist", "song", "music-video"]);

/**
 * Resolves an Apple Music address to a storefront, a kind and an id.
 *
 * The human-readable slug between the kind and the id is DISCARDED rather than
 * carried over: the embed resolves from the other three, and a slug is a
 * free-text segment. Every part that survives is matched against a pattern
 * before it reaches the template.
 *
 * @param url - a parsed URL already known to be on Apple Music's host.
 * @returns the embed path, or null.
 */
function applePath(url: URL): string | null {
  const [country, kind, , id] = url.pathname.split("/").filter(Boolean);
  if (!country || !kind || !id) return null;
  if (!APPLE_COUNTRY.test(country)) return null;
  if (!APPLE_KINDS.has(kind) || !APPLE_ID.test(id)) return null;
  return `${country}/${kind}/${id}`;
}

/** The Deezer resources with an embeddable widget. */
const DEEZER_KINDS = new Set(["track", "album", "playlist", "artist"]);

/**
 * Resolves a Deezer address to a kind and a numeric id.
 *
 * A shared link may carry a two-letter language ahead of the kind, exactly as
 * Spotify's carries `intl-`. It is dropped: the widget takes neither.
 *
 * @param url - a parsed URL already known to be on Deezer's host.
 * @returns the widget path, or null.
 */
function deezerPath(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const rest = /^[a-z]{2}$/.test(parts[0] ?? "") ? parts.slice(1) : parts;
  const [kind, id] = rest;
  if (!kind || !id) return null;
  if (!DEEZER_KINDS.has(kind) || !/^\d+$/.test(id)) return null;
  return `${kind}/${id}`;
}

/**
 * A Tidal playlist id, which is a UUID rather than a number.
 *
 * Written as five literal groups rather than `(-[0-9a-f]{4}){3}`: the
 * repeated group is what `security/detect-unsafe-regex` flags as an unsafe
 * pattern, even though the fixed length here admits no backtracking blowup.
 * Spelling it out clears the rule without weakening the check.
 */
const TIDAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tidal's embed path and id shape, by the kind its own address uses.
 *
 * A lookup rather than appending an `s`, because the plural is the EMBED's
 * spelling and not a transformation of the input — deriving it would break the
 * moment a kind pluralised irregularly, and would let an unknown kind through.
 *
 * **The id pattern is per kind and that is not tidiness.** Tracks and albums
 * are numeric while playlists are UUIDs, so one pattern wide enough for both
 * would accept `track/abc` — a value that is not an id at all, interpolated
 * into an address this app publishes.
 *
 * **A `Map`, not a plain object, and that is load-bearing.** `kind` is the
 * untrusted path segment this table is indexed by. A plain object literal
 * inherits from `Object.prototype`, so indexing it with a caller-chosen key
 * (`TIDAL_KINDS["__proto__"]`, `TIDAL_KINDS["constructor"]`) resolves to an
 * inherited value rather than `undefined` — truthy enough to pass a `!entry`
 * guard, and then `entry.id` is not the `{ path, id }` shape this table
 * stores, so `entry.id.test(id)` throws. A `Map` has no prototype chain to
 * fall through: `get("__proto__")` is an ordinary miss, same as any other
 * absent key.
 */
const TIDAL_KINDS = new Map<string, { path: string; id: RegExp }>([
  ["track", { path: "tracks", id: /^\d+$/ }],
  ["album", { path: "albums", id: /^\d+$/ }],
  ["playlist", { path: "playlists", id: TIDAL_UUID }],
]);

/**
 * Resolves a Tidal address to an embed path.
 *
 * `tidal.com/browse/track/<id>` and `tidal.com/track/<id>` are the same
 * resource, so a leading `browse` is dropped. `new URL()` already normalises
 * `..` segments during parsing — `track/aaa/../../evil` arrives with a
 * pathname of `/evil`, one segment, so `kind` is `"evil"` and `id` is
 * `undefined`. Verified with `node -e`: what refuses it is the `!entry`
 * check — `"evil"` is not a key `TIDAL_KINDS` holds, so the lookup misses and
 * the guard short-circuits there, before `id` is ever tested. Not a pattern
 * declining a separator, and not the missing-`id` check either — that check
 * is never reached for this input.
 *
 * @param url - a parsed URL already known to be on a Tidal host.
 * @returns the embed path, or null.
 */
function tidalPath(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const rest = parts[0] === "browse" ? parts.slice(1) : parts;
  const [kind, id] = rest;
  const entry = TIDAL_KINDS.get(kind ?? "");
  if (!entry || !id || !entry.id.test(id)) return null;
  return `${entry.path}/${id}`;
}

/** One path segment of a Mixcloud address. */
const MIXCLOUD_SEGMENT = /^[\w-]{1,64}$/;

/**
 * Rebuilds a canonical Mixcloud feed path.
 *
 * A show is `/<user>/<slug>/`, with the trailing slash the widget expects. A
 * bare profile has one segment and no player. Every segment is matched against
 * a pattern that admits no separator and no `&`, so the value the caller
 * encodes into the widget's `feed` parameter cannot introduce a second one.
 *
 * @param url - a parsed URL already known to be on Mixcloud's host.
 * @returns the feed path, or null.
 */
function mixcloudFeed(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !parts.every((p) => MIXCLOUD_SEGMENT.test(p))) {
    return null;
  }
  return `/${parts.join("/")}/`;
}

/** A Twitch channel name, or a past-broadcast id. */
const TWITCH_NAME = /^\w{3,25}$/;

/**
 * Resolves a Twitch address to a channel or a past broadcast.
 *
 * Returns the value already tagged with its kind — `video:123` or
 * `channel:luna` — because the two take different parameters and the template
 * must not have to re-parse what this already decided.
 *
 * @param url - a parsed URL already known to be on Twitch's host.
 * @returns the tagged value, or null.
 */
function twitchTarget(url: URL): string | null {
  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first === "videos") {
    return /^\d+$/.test(second ?? "") ? `video:${second}` : null;
  }
  if (!first || second) return null;
  return TWITCH_NAME.test(first) ? `channel:${first}` : null;
}

/** A Telegram channel username: 5-32 word characters, Telegram's own rule. */
const TELEGRAM_CHANNEL = /^\w{5,32}$/;

/** A Telegram post id: digits only. */
const TELEGRAM_POST_ID = /^\d{1,10}$/;

/**
 * Resolves a Telegram post address to its channel and post id.
 *
 * @param url - a parsed URL already known to be on `t.me`.
 * @returns `channel/id`, or null.
 */
function telegramPath(url: URL): string | null {
  const [channel, id] = url.pathname.split("/").filter(Boolean);
  if (!channel || !id) return null;
  return TELEGRAM_CHANNEL.test(channel) && TELEGRAM_POST_ID.test(id)
    ? `${channel}/${id}`
    : null;
}

/** The Instagram post kinds Instagram's own `/p/<code>/embed` endpoint serves. */
const INSTAGRAM_KINDS = new Set(["p", "reel", "tv"]);

/** An Instagram shortcode: Instagram's own URL-safe alphabet. */
const INSTAGRAM_CODE = /^[\w-]{5,20}$/;

/**
 * Resolves an Instagram post address to its shortcode.
 *
 * `/p/`, `/reel/` and `/tv/` all resolve — Instagram's embed endpoint serves
 * all three from the same `/p/<code>/embed` path, so the kind is checked and
 * then discarded rather than carried into the template.
 *
 * @param url - a parsed URL already known to be on Instagram's host.
 * @returns the shortcode, or null.
 */
function instagramCode(url: URL): string | null {
  const [kind, code] = url.pathname.split("/").filter(Boolean);
  if (!kind || !INSTAGRAM_KINDS.has(kind) || !code) return null;
  return INSTAGRAM_CODE.test(code) ? code : null;
}

/** An X/Twitter handle: word characters, one to fifteen — Twitter's own limit. */
const TWITTER_USER = /^\w{1,15}$/;

/** A tweet id: digits only. */
const TWEET_ID = /^\d{1,25}$/;

/**
 * Resolves an X/Twitter status address to its tweet id.
 *
 * The author's handle is part of the pasted address but not of the embed —
 * `platform.twitter.com`'s widget takes only the id — so it is validated and
 * discarded rather than carried into the template.
 *
 * @param url - a parsed URL already known to be on `x.com` or `twitter.com`.
 * @returns the tweet id, or null.
 */
function tweetId(url: URL): string | null {
  const [user, kind, id] = url.pathname.split("/").filter(Boolean);
  if (!user || kind !== "status" || !id) return null;
  return TWITTER_USER.test(user) && TWEET_ID.test(id) ? id : null;
}

/** A Pinterest pin id: digits only. */
const PIN_ID = /^\d{5,25}$/;

/**
 * Resolves a Pinterest pin address to its id.
 *
 * @param url - a parsed URL already known to be on `pinterest.com`.
 * @returns the pin id, or null.
 */
function pinterestPinId(url: URL): string | null {
  const [kind, id] = url.pathname.split("/").filter(Boolean);
  if (kind !== "pin" || !id) return null;
  return PIN_ID.test(id) ? id : null;
}

/** A Mastodon username: word characters and dots, one to thirty — Mastodon's own limit. */
const MASTODON_USER = /^[\w.]{1,30}$/;

/** A Mastodon status id: digits only. */
const MASTODON_POST_ID = /^\d{1,25}$/;

/**
 * Resolves a Mastodon post address to its user and status id.
 *
 * **Shared by every Mastodon-instance entry in the table.** Which instance a
 * pasted address is on is already decided by which entry's `hosts` matched it
 * — the table has one entry per allowed instance, never a wildcard — so this
 * function only has to parse the `@user/id` shape every instance uses, and
 * each entry's own `src` re-attaches its own host. Adding an instance is a
 * table entry, never a change to this parser.
 *
 * @param url - a parsed URL already known to be on an allowlisted instance.
 * @returns `user/id`, or null.
 */
function mastodonPath(url: URL): string | null {
  const [handle, id] = url.pathname.split("/").filter(Boolean);
  if (!handle?.startsWith("@") || !id) return null;
  const user = handle.slice(1);
  return MASTODON_USER.test(user) && MASTODON_POST_ID.test(id)
    ? `${user}/${id}`
    : null;
}

/**
 * Every service this platform can build a player address for.
 *
 * **One entry per provider, and the table is the only place a host or an
 * origin is named.** `PLAYER_ORIGINS` is derived from it, so the content
 * security policy cannot allow a frame the resolver refuses to build, or
 * refuse one it does. `EmbedProviderId` is derived from it too — declared
 * `as const satisfies readonly EmbedProviderDef[]` rather than given a `:`
 * type annotation, because an annotation would widen every `id` here to
 * `string` before a union could be built from them.
 *
 * The address forms each `resolve` accepts, which live inside its closure and
 * are otherwise invisible from this array:
 *
 * - **YouTube** — `youtu.be/<id>`, `watch?v=<id>`, and the `shorts` / `embed`
 *   / `live` / `v` path forms.
 * - **Vimeo** — `vimeo.com/<id>` and `player.vimeo.com/video/<id>`.
 * - **Spotify** — `<kind>/<id>` where `kind` is `track` / `album` /
 *   `playlist` / `artist` / `episode` / `show`, with an optional leading
 *   `intl-<country>` segment.
 * - **SoundCloud** — a two-segment track (`artist/track`) or a three-segment
 *   `sets` album (`artist/sets/album`).
 * - **Dailymotion** — `dailymotion.com/video/<id>` and the short
 *   `dai.ly/<id>`.
 * - **TikTok** — `/@handle/video/<id>` only; a bare profile has no player and
 *   resolves to null rather than to the profile page in a frame.
 * - **Apple Music** — `<country>/<kind>/<slug>/<id>` where `kind` is `album` /
 *   `playlist` / `song` / `music-video`, `country` is a two-letter storefront,
 *   `slug` is discarded, and `id` is digits or a `pl.`-prefixed playlist token.
 * - **Deezer** — `<kind>/<id>` where `kind` is `track` / `album` / `playlist` /
 *   `artist` and `id` is digits, with an optional leading two-letter language
 *   segment.
 * - **Tidal** — `<kind>/<id>` (`tidal.com` or `listen.tidal.com`), with an
 *   optional leading `browse` segment. `kind` is `track` / `album` (numeric
 *   `id`) or `playlist` (`id` a UUID).
 * - **Mixcloud** — `<user>/<slug>/`, a show's two-segment address; a bare
 *   profile has no player and resolves to null.
 * - **Twitch** — `twitch.tv/<channel>` or `twitch.tv/videos/<id>`, a past
 *   broadcast. Its `src` is the one that reads `parentHost`: Twitch's player
 *   refuses to load without a `parent=` naming the embedding domain, so
 *   resolving without one is refused by {@link resolveEmbed} before `src` is
 *   ever called. `parentHost` is deployment configuration rather than a
 *   parsed, pattern-matched value like every other value these templates
 *   interpolate, so it is `encodeURIComponent`-ed on the way in rather than
 *   trusted as an exception to that rule.
 * - **Telegram** — `t.me/<channel>/<id>`, a five-to-thirty-two-character
 *   channel name and a numeric post id.
 * - **Instagram** — `instagram.com/p/<code>`, `/reel/<code>` or `/tv/<code>`;
 *   all three resolve to the same `/p/<code>/embed` address.
 * - **X/Twitter** — `x.com/<user>/status/<id>` or the equivalent
 *   `twitter.com` address; the handle is validated and then discarded, since
 *   the widget takes only the tweet id.
 * - **Pinterest** — `pinterest.com/pin/<id>`, a numeric pin id, embedded on
 *   `assets.pinterest.com` — a dedicated widget host distinct from
 *   Pinterest's own logged-out web app, which walls off anonymous visitors.
 * - **Mastodon** — `<instance>/@<user>/<id>`, one table entry per allowed
 *   instance rather than one entry for the whole protocol, because
 *   `EmbedProviderDef.origin` is a single string and every entry's `src` must
 *   build on the host it declares. The allowed instances — `mastodon.social`,
 *   `mstdn.social`, `meow.social`, `furry.engineer` — were each verified
 *   directly: its `/@user/id/embed` address was loaded logged out and
 *   confirmed to render the post, with no `X-Frame-Options` and no
 *   `frame-ancestors` excluding this app. Another candidate, `pawb.social`,
 *   was considered and refused: it answers `/@user/id/embed` with a 404
 *   because it runs Lemmy, not Mastodon — confirmed via its own
 *   `/nodeinfo/2.1`, which names `"software":{"name":"lemmy"}`. A
 *   Mastodon-shaped host is not evidence of Mastodon software.
 */
export const EMBED_PROVIDERS = [
  {
    id: "youtube",
    hosts: ["youtube.com", "youtu.be"],
    origin: "https://www.youtube-nocookie.com",
    shape: "video",
    resolve: youtubeId,
    src: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
  },
  {
    id: "vimeo",
    hosts: ["vimeo.com", "player.vimeo.com"],
    origin: "https://player.vimeo.com",
    shape: "video",
    resolve: vimeoId,
    src: (id) => `https://player.vimeo.com/video/${id}`,
  },
  {
    id: "spotify",
    hosts: ["open.spotify.com"],
    origin: "https://open.spotify.com",
    shape: "audio",
    resolve: spotifyPath,
    src: (path) => `https://open.spotify.com/embed/${path}`,
  },
  {
    id: "soundcloud",
    hosts: ["soundcloud.com"],
    origin: "https://w.soundcloud.com",
    shape: "audio",
    resolve: soundcloudUrl,
    src: (track) =>
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}`,
  },
  {
    id: "dailymotion",
    hosts: ["dailymotion.com", "dai.ly"],
    origin: "https://geo.dailymotion.com",
    shape: "video",
    resolve: dailymotionId,
    src: (id) => `https://geo.dailymotion.com/player.html?video=${id}`,
  },
  {
    id: "tiktok",
    hosts: ["tiktok.com"],
    origin: "https://www.tiktok.com",
    shape: "portrait",
    resolve: tiktokId,
    src: (id) => `https://www.tiktok.com/embed/v2/${id}`,
  },
  {
    id: "applemusic",
    hosts: ["music.apple.com"],
    origin: "https://embed.music.apple.com",
    shape: "audio",
    resolve: applePath,
    src: (path) => `https://embed.music.apple.com/${path}`,
  },
  {
    id: "deezer",
    hosts: ["deezer.com"],
    origin: "https://widget.deezer.com",
    shape: "audio",
    resolve: deezerPath,
    src: (path) => `https://widget.deezer.com/widget/dark/${path}`,
  },
  {
    id: "tidal",
    hosts: ["tidal.com", "listen.tidal.com"],
    origin: "https://embed.tidal.com",
    shape: "audio",
    resolve: tidalPath,
    src: (path) => `https://embed.tidal.com/${path}`,
  },
  {
    id: "mixcloud",
    hosts: ["mixcloud.com"],
    origin: "https://player.mixcloud.com",
    shape: "audio",
    resolve: mixcloudFeed,
    src: (feed) =>
      `https://player.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(feed)}`,
  },
  {
    id: "twitch",
    hosts: ["twitch.tv"],
    origin: "https://player.twitch.tv",
    shape: "video",
    resolve: twitchTarget,
    // `parentHost` is the one value here that never matched a pattern: it is
    // deployment configuration (`NEXT_PUBLIC_HUB_HOST`, validated only as
    // `z.string()`), not something a visitor pastes, and it cannot move the
    // origin a frame is built on. But the module's rule is that nothing
    // unencoded reaches a template, and a config-value exception invites an
    // attacker-value one — so it is encoded anyway, at no cost.
    src: (value, parentHost) => {
      const [kind, id] = value.split(":");
      return `https://player.twitch.tv/?${kind === "video" ? "video" : "channel"}=${id}&parent=${encodeURIComponent(parentHost)}`;
    },
  },
  {
    id: "telegram",
    hosts: ["t.me"],
    origin: "https://t.me",
    shape: "post",
    resolve: telegramPath,
    src: (value) => `https://t.me/${value}?embed=1`,
  },
  {
    id: "instagram",
    hosts: ["instagram.com"],
    origin: "https://www.instagram.com",
    shape: "post",
    resolve: instagramCode,
    src: (code) => `https://www.instagram.com/p/${code}/embed`,
  },
  {
    id: "twitter",
    hosts: ["x.com", "twitter.com"],
    origin: "https://platform.twitter.com",
    shape: "post",
    resolve: tweetId,
    src: (id) => `https://platform.twitter.com/embed/Tweet.html?id=${id}`,
  },
  {
    id: "pinterest",
    hosts: ["pinterest.com"],
    origin: "https://assets.pinterest.com",
    shape: "post",
    resolve: pinterestPinId,
    src: (id) => `https://assets.pinterest.com/ext/embed.html?id=${id}`,
  },
  // Mastodon is one entry per instance, never a wildcard — see this table's
  // own TSDoc for why `origin` forces that shape, and for the fifth instance
  // considered and refused.
  {
    id: "mastodon-social",
    hosts: ["mastodon.social"],
    origin: "https://mastodon.social",
    shape: "post",
    resolve: mastodonPath,
    src: (value) => `https://mastodon.social/@${value}/embed`,
  },
  {
    id: "mstdn-social",
    hosts: ["mstdn.social"],
    origin: "https://mstdn.social",
    shape: "post",
    resolve: mastodonPath,
    src: (value) => `https://mstdn.social/@${value}/embed`,
  },
  {
    id: "meow-social",
    hosts: ["meow.social"],
    origin: "https://meow.social",
    shape: "post",
    resolve: mastodonPath,
    src: (value) => `https://meow.social/@${value}/embed`,
  },
  {
    id: "furry-engineer",
    hosts: ["furry.engineer"],
    origin: "https://furry.engineer",
    shape: "post",
    resolve: mastodonPath,
    src: (value) => `https://furry.engineer/@${value}/embed`,
  },
] as const satisfies readonly EmbedProviderDef[];

/**
 * A service whose player a fursona's page may frame.
 *
 * Derived from `EMBED_PROVIDERS`'s own `id` fields via `as const satisfies`,
 * so there is no second list a new provider could be added to without also
 * touching the table — union/table drift is not merely documented against
 * here, it is structurally impossible: nothing else contributes a member.
 */
export type EmbedProviderId = (typeof EMBED_PROVIDERS)[number]["id"];

/**
 * Everything needed to turn one service's addresses into one player.
 *
 * `src` takes the embedding host alongside the resolved value — see its own
 * TSDoc for why every provider is handed it though only Twitch reads it, and
 * for why that one value is encoded separately from `resolve`'s output: it is
 * the one value here that never matched a pattern.
 */
export interface EmbedProvider {
  /** Whose player it is. */
  id: EmbedProviderId;
  /**
   * Exact hostnames, already stripped of a leading `www.` or `m.`.
   *
   * Matched by equality and never by prefix or suffix, which is what makes
   * `youtube.com.evil.example` and `evil-youtube.com` fail.
   */
  hosts: readonly string[];
  /** The origin its player is framed from. Feeds `frame-src`. */
  origin: string;
  /** How tall the frame should be. */
  shape: EmbedShape;
  /**
   * Extracts the identifier the template needs, or null.
   *
   * **The value it returns is interpolated without further checking**, so it
   * must already match a strict pattern. Returning null is ordinary — it means
   * this address is not one this provider can play.
   */
  resolve: (url: URL) => string | null;
  /**
   * Builds the player address from a resolved identifier.
   *
   * Every provider's `src` receives the embedding host, and only Twitch's
   * reads it — passing it to all of them uniformly is what keeps this table
   * one shape rather than Twitch needing a different `src` signature than
   * every other provider.
   */
  src: (value: string, parentHost: string) => string;
}

/**
 * The provider claiming a hostname, or null.
 *
 * Its `find` callback is typed explicitly as `EmbedProviderDef` rather than
 * left to infer: `EMBED_PROVIDERS` is a tuple of distinct literal types, each
 * with its own literal `hosts` tuple, and an inferred callback parameter
 * widens to their union — `.includes` on a union of structurally disjoint
 * tuples has no argument type that satisfies every member, which TypeScript
 * reports as `never`. That is a property of the entries being distinct
 * literal types, not of how many there are, so it holds regardless of the
 * table's length. Every entry already satisfies `EmbedProviderDef`, so a
 * callback typed for that wider shape is still a valid predicate for each of
 * them.
 *
 * @param hostname - a parsed hostname, already stripped of `www.`/`m.`.
 * @returns the provider, or null when no entry claims it exactly.
 */
export function findProvider(hostname: string): EmbedProvider | null {
  if (!hostname) return null;
  // See this function's TSDoc for why the callback parameter below is typed
  // explicitly rather than inferred.
  return (
    EMBED_PROVIDERS.find((provider: EmbedProviderDef) =>
      provider.hosts.includes(hostname),
    ) ?? null
  );
}

/**
 * Every origin the table can build a player on, each once.
 *
 * This is what `PLAYER_ORIGINS` is, and deriving it is the point: a host can no
 * longer be allowed in `frame-src` without a provider that builds on it, or
 * built without being allowed.
 *
 * @returns the origins, deduplicated.
 */
export function providerOrigins(): string[] {
  return [...new Set(EMBED_PROVIDERS.map((provider) => provider.origin))];
}
