// `isInternalPath` deliberately is NOT re-exported from here or from the
// feature barrel. It answers a different question — "does this stay on the
// hub?" rather than "may we send somebody to this other app?" — and every
// import site of this module is a place where taking the wrong one is a full
// open redirect. It lives in `@/shared/domain/return-to`, one import away, and
// reaching for it there is a deliberate act rather than an autocomplete.

/** Schemes a redirect target may use. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Whether the picker may send someone to this URL when they are done.
 *
 * Compares the **parsed origin** — scheme, host and port together — against an
 * exact allowlist. String matching is what makes
 * `https://puck.furrycolombia.com.evil.example` look allowed under
 * `startsWith` and `https://evil.puck.furrycolombia.com` look allowed under
 * `endsWith`, so neither is used.
 *
 * A URL carrying credentials is refused outright even if its origin matches:
 * the userinfo before the `@` is what a browser shows first, so handing one
 * back would let an allowed origin decorate a link that goes elsewhere. A raw
 * tab, LF or CR is refused before parsing for a different reason: the WHATWG
 * parser strips those characters, so the origin check would pass on the
 * *parsed* string while the caller still holds the *raw* one — and Node
 * throws `ERR_INVALID_CHAR` the moment that raw string reaches a redirect
 * header, turning an accepted candidate into a crash.
 *
 * An accepted URL may legitimately carry a query or a fragment — both are
 * part of its origin-scoped path, not of the origin itself. A caller that
 * appends its own data (e.g. `actor_ref`) **must** use
 * `URL.searchParams.set`, never string concatenation: appending a literal
 * `?actor_ref=…` turns an existing `?a=b` into `?a=b?actor_ref=…` (swallowed
 * into `a`), and turns an existing `#f` into a fragment that never reaches
 * the server at all, silently dropping `actor_ref`.
 *
 * The allowed origins arrive as a parameter rather than being read here,
 * because this file is in `domain/` and may not reach into infrastructure —
 * which also means it is testable without mocking the environment.
 *
 * @param candidate - the caller-supplied URL, entirely untrusted.
 * @param allowed - exact origins, as `env.allowedReturnOrigins` supplies them.
 * @returns true only when the parsed origin matches one of them exactly.
 */
export function isAllowedReturnTo(
  candidate: string,
  allowed: readonly string[],
): boolean {
  // The parser silently strips these before comparing origins; refusing them
  // on the raw string closes that gap and avoids handing a caller a string
  // Node will later refuse to put in a header.
  if (/[\t\r\n]/.test(candidate)) return false;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (!SAFE_PROTOCOLS.has(url.protocol)) return false;
  if (url.username !== "" || url.password !== "") return false;

  return allowed.includes(url.origin);
}

/**
 * Where to send somebody who does not want to choose an actor after all.
 *
 * The picker's way out. By the time this is called the destination has already
 * passed {@link isAllowedReturnTo}, so sending the person there is exactly as
 * safe as sending them there *with* a choice — the only difference is that
 * nothing is handed back, which is the whole point: declining must be a
 * navigation the person can take, not a browser-back guess. In a redirect chain
 * the back button often lands them where they started and bounces them forward
 * again, so "no link" is not a neutral choice; it is a trap.
 *
 * **`actor_ref` is removed, not merely left unset.** The caller supplies
 * `return_to` and may legitimately or maliciously have put an `actor_ref` on it
 * already. Passing the URL through untouched would deliver that value to the
 * consuming app under the appearance of a deliberate choice — the person
 * declined and the app is told they picked. Deleting the key means a decline
 * always arrives empty, whatever the caller wrote.
 *
 * **The query string is all that is cleaned, and only that exact key.** A
 * planted `#actor_ref=…` survives in the fragment, and so does a differently
 * cased `?ACTOR_REF=…`, because query keys are case-sensitive and a fragment
 * is not a query. Neither is reachable by an app that reads the choice where
 * the hub puts it — `?actor_ref=…`, appended with `searchParams.set` — but a
 * hash-routed SPA parsing its own fragment would find a value on a decline
 * that nobody chose. Read the choice from the query string only.
 *
 * Returns the **parsed** URL's serialisation rather than the raw string, so
 * what lands in an `href` is what a parser agrees the destination is, not
 * whatever the caller happened to type.
 *
 * @param returnTo - a destination already proven allowed by
 * {@link isAllowedReturnTo}.
 * @returns the same destination, normalised and carrying no `actor_ref`.
 * @throws if `returnTo` does not parse. Not defended against here: an
 * unparseable value cannot reach this function, because it cannot pass the
 * guard that runs first.
 */
export function declineUrl(returnTo: string): string {
  const url = new URL(returnTo);
  url.searchParams.delete("actor_ref");
  return url.toString();
}
