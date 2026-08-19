import type { EmbedProviderId } from "@/shared/domain/embed-providers";

/**
 * The shortest height a provider is believed when it claims.
 *
 * A frame this short is not a rendered post — it is a widget that has not
 * finished loading, or one reporting the collapsed box it was asked from. The
 * shortest thing ever measured in a browser was a Spotify track card at 152
 * and the shortest `post` a Mastodon status at 337, so this sits well below
 * anything real and only ever refuses a number that would collapse somebody's
 * page.
 */
const MIN_HEIGHT = 40;

/**
 * The tallest height a provider is believed when it claims.
 *
 * **A guard against a frame rather than against a mistake.** Everything on the
 * other side of this message is a third party's script running in a document
 * this app does not control, and `height` goes straight into a style — so a
 * frame that says `1e9`, whether compromised or merely wrong, would otherwise
 * hand a visitor a page kilometres tall with no way back. The tallest real
 * thing measured was a Telegram post at 781. A genuinely taller post is capped
 * and scrolls inside its own frame, which is exactly what every post did
 * before any of this existed.
 */
const MAX_HEIGHT = 4000;

/**
 * A height a frame claimed, if it is one worth applying.
 *
 * @param value - whatever stood where a height was expected.
 * @returns the height, rounded, or null when it is not a usable number.
 */
function sane(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const height = Math.round(value);
  return height >= MIN_HEIGHT && height <= MAX_HEIGHT ? height : null;
}

/**
 * A message payload read as a bag of fields, or null when it is not one.
 *
 * **Arrays are refused as well as primitives**, so `params[0]` cannot be
 * satisfied by a string with a `length`. Nothing here reaches for a key that
 * did not come from this file, so a payload carrying `__proto__` is an
 * ordinary field nobody reads.
 *
 * @param value - whatever arrived.
 * @returns the payload as a record, or null.
 */
function bag(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A JSON string's contents, or null when it is neither a string nor JSON.
 *
 * **`JSON.parse` and never `eval`, and the `catch` is the point.** Two of the
 * three providers that volunteer a height send a string rather than an object,
 * and a string arriving on `window`'s message channel is written by whoever
 * controls that frame — so a parse failure is an ordinary outcome here, not a
 * fault.
 *
 * @param value - whatever arrived.
 * @returns the parsed value, or null.
 */
function fromJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/**
 * The height in one of X/Twitter's widget messages.
 *
 * Twitter sends an **object**, wrapped in a `twttr.embed` envelope, among
 * several messages of which only the resize one carries a size:
 *
 * ```js
 * { "twttr.embed": { jsonrpc: "2.0", method: "twttr.private.resize",
 *   id: "embed-0", params: [{ width: 420, height: 589, data: { … } }] } }
 * ```
 *
 * The height it reports is the tweet's own, independent of the frame it is in
 * — measured at 225 for a short tweet in a 600px box — and a fresh message
 * arrives whenever the frame's width changes.
 *
 * @param data - the message payload.
 * @returns the tweet's painted height, or null for any other message.
 */
function twitterHeight(data: unknown): number | null {
  const message = bag(bag(data)?.["twttr.embed"]);
  if (message?.["method"] !== "twttr.private.resize") return null;
  const params = message["params"];
  if (!Array.isArray(params)) return null;
  return sane(bag(params[0])?.["height"]);
}

/**
 * The height in one of Instagram's embed messages.
 *
 * A **JSON string**, not an object — `'{"details":{"height":444},"type":"MEASURE"}'`
 * — sent about a second after the frame is created and again whenever the
 * width changes. Its siblings are `LOADING` and `MOUNTED`, which carry no
 * height and must not be mistaken for one.
 *
 * @param data - the message payload.
 * @returns the post's painted height, or null for any other message.
 */
function instagramHeight(data: unknown): number | null {
  const message = bag(fromJson(data));
  if (message?.["type"] !== "MEASURE") return null;
  return sane(bag(message["details"])?.["height"]);
}

/**
 * The height in one of Telegram's embed messages.
 *
 * A **JSON string** — `'{"event":"resize","height":781}'` — alongside an
 * `{"event":"ready"}` that carries no height.
 *
 * @param data - the message payload.
 * @returns the post's painted height, or null for any other message.
 */
function telegramHeight(data: unknown): number | null {
  const message = bag(fromJson(data));
  if (message?.["event"] !== "resize") return null;
  return sane(message["height"]);
}

/**
 * The height in a Mastodon instance's answer.
 *
 * An **object**, and only ever in reply to {@link HEIGHT_REQUEST}: no
 * allowlisted instance volunteers a height, on load or on resize.
 *
 * ```js
 * { type: "setHeight", id: 7, height: 754 }
 * ```
 *
 * **The echoed `id` is not checked, and that is not laxity.** What identifies
 * the answer is that it arrived from the instance's own origin AND from this
 * frame's own `contentWindow`; an `id` is a value the same sender chose, so
 * checking it would add nothing a forged message could not also satisfy.
 *
 * @param data - the message payload.
 * @returns the post's painted height, or null for any other message.
 */
function mastodonHeight(data: unknown): number | null {
  const message = bag(data);
  if (message?.["type"] !== "setHeight") return null;
  return sane(message["height"]);
}

/**
 * What the parent sends a Mastodon frame to make it answer with its height.
 *
 * **It has to be sent from a frame that is not yet tall.** An instance answers
 * `max(content height, frame height)` — measured across four instances and
 * four frame heights — so the same post answers `600` in a 600px box and its
 * true `337` in a 1px one. Asking from the frame at its resting height would
 * return the resting height and prove nothing.
 *
 * `id` is echoed back verbatim and any value works, including none; a constant
 * is used so the message is one object rather than one per frame.
 */
export const HEIGHT_REQUEST = { type: "setHeight", id: "aeleos" };

/** How one provider's frame comes to report its own height. */
export interface EmbedFit {
  /**
   * Whether the frame has to be ASKED, rather than volunteering.
   *
   * True only for Mastodon, and it costs the frame a measuring pass: see
   * {@link HEIGHT_REQUEST} for why the ask has to happen from a collapsed
   * frame, which is what `EmbedFrame` does and what nothing renders on the
   * server.
   */
  ask: boolean;
  /**
   * Reads a height out of one message from this provider, or null.
   *
   * Called only for a message that has already passed both the origin and the
   * `event.source` check, so this is a parser and not a guard.
   */
  height: (data: unknown) => number | null;
}

/**
 * The providers whose frames can be made to report their own height.
 *
 * **A provider absent from here is a provider framed at a measured constant**,
 * which is most of them: Spotify, Apple Music, Tidal and TikTok all say
 * nothing and were each answered with a number instead — see
 * `embed-providers.ts`. Pinterest is absent because it can neither be asked
 * nor sized: six different pins measured 516, 638, 645, 750, 840 and 962 in
 * the same 420px-wide frame, so no constant is right for a second pin, and it
 * answers no request of any shape.
 *
 * **A `Map` keyed by `EmbedProviderId`**, so a key that is not a provider is a
 * compile error rather than an entry nothing ever reads. It is also what makes
 * the lookup safe from a caller holding a value that came from stored data,
 * for the reason `TIDAL_KINDS` states at length.
 *
 * Every payload shape below was recorded from a real frame on 2026-08-19,
 * origin and all; none of it is documented by its provider.
 */
export const EMBED_FIT: ReadonlyMap<EmbedProviderId, EmbedFit> = new Map<
  EmbedProviderId,
  EmbedFit
>([
  ["twitter", { ask: false, height: twitterHeight }],
  ["instagram", { ask: false, height: instagramHeight }],
  ["telegram", { ask: false, height: telegramHeight }],
  ["mastodon-social", { ask: true, height: mastodonHeight }],
  ["mstdn-social", { ask: true, height: mastodonHeight }],
  ["meow-social", { ask: true, height: mastodonHeight }],
  ["furry-engineer", { ask: true, height: mastodonHeight }],
]);
