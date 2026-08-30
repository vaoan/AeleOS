/**
 * Types for the pastiche reference registry.
 *
 * The implementation is plain `.mjs`, matching `pastiche-pages.mjs` and every
 * other CLI-facing script in this directory: it runs under plain Node, with
 * no build step and no access to the app's `@/` alias. This declaration
 * exists so a test can import `REFERENCES`, `captureUrl` and
 * `inspirationSection` and have them typecheck. The section shape below is
 * structural rather than imported from the app, for the same reason
 * `pastiche-pages.d.mts` gives.
 */

/**
 * What one pastiche page is imitating, and where the evidence lives.
 *
 * A caller may assume `title_en`/`title_es` and `link_label_en`/
 * `link_label_es` are always populated, on every entry, in both languages —
 * they are the author's own writing rather than catalogue keys. Exactly one
 * of `image` or `absent` is set: `image` is a hot link to a real capture (or
 * to a curated file, for the six subjects that are not a web page at all),
 * never a stored file; `absent` is the stated reason no capture exists, and
 * `absent_es` is its Spanish translation, present whenever `absent` is.
 * `link` is always set and points somewhere a reader can follow beyond the
 * one picture shown.
 */
export interface Reference {
  /** A hot link to a real capture or curated file. Never a stored file. */
  image?: string;
  /** The stated reason no capture exists, in English. */
  absent?: string;
  /** The stated reason no capture exists, in Spanish. Set iff `absent` is. */
  absent_es?: string;
  /** Where a reader can follow beyond the one picture shown. */
  link: string;
  /** The picture's caption, in English. */
  title_en: string;
  /** The picture's caption, in Spanish. */
  title_es: string;
  /** The trailing link's label, in English. */
  link_label_en: string;
  /** The trailing link's label, in Spanish. */
  link_label_es: string;
}

/**
 * One entry per seeded page — the eleven social pastiches and the five era
 * looks — keyed by the same handle `pastiche-pages.mjs` seeds it under.
 */
export declare const REFERENCES: Record<string, Reference>;

/**
 * Builds a hot link to a rendered screenshot of one arquivo.pt capture.
 *
 * @param timestamp - the fourteen-digit capture timestamp arquivo.pt assigns
 *   the page (`YYYYMMDDhhmmss`).
 * @param originalUrl - the page's own URL at capture time, unencoded.
 * @returns a URL on `arquivo.pt`'s own screenshot endpoint — a hot link that
 *   renders on request. Nothing is fetched, stored, or written by this
 *   function.
 */
export declare function captureUrl(
  timestamp: string,
  originalUrl: string,
): string;

/** A depth-0 named container block, structurally like a page's own blocks. */
export interface InspirationSection {
  kind: "container";
  mode: "stack";
  name_en: string;
  name_es: string;
  children: Array<Record<string, unknown>>;
  style: Record<string, unknown>;
}

/**
 * The section that shows what a page is imitating.
 *
 * @param reference - one entry from {@link REFERENCES}.
 * @returns a depth-0 named container, ready to append to a page's `blocks`.
 *   Its children depend on which branch the reference took: a `picture` and
 *   a trailing `link` when `reference.image` is set, or a `text` stating the
 *   reason and a trailing `link` when `reference.absent` is set instead.
 *   Idempotent and side-effect-free — every URL inside the result is a hot
 *   link the renderer resolves later, never fetched here.
 */
export declare function inspirationSection(
  reference: Reference,
): InspirationSection;
