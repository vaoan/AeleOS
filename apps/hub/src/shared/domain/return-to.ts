/**
 * Whether a value is a path on this origin, safe to redirect to.
 *
 * Guards two different redirects that both take their destination from a
 * caller-supplied string: the picker's return to an internal actor page, and
 * `resolveAfterSignInUrl`'s return to wherever a signed-out visitor was
 * originally headed. Both destinations arrive in a query string and are used
 * only after they are proven **not** to leave the hub — the classic
 * post-login open redirect shape — so this lives in `shared/domain` rather
 * than inside `features/picker`: `shared/infrastructure` may not depend on a
 * feature (the dependency rule runs one way only), and duplicating the check
 * in two places would let the copies drift apart.
 *
 * This parses the candidate against a fixed, meaningless base origin rather
 * than inspecting the string, because inspection was tried first and it was
 * not enough: a leading-slash-plus-shape check (`//host`, `/\host`) reads
 * every character the string contains, but the WHATWG parser that ultimately
 * resolves the value **removes ASCII tab, LF and CR from anywhere in the
 * input before parsing**. `"/\t/evil.example"` fails every string check —
 * it starts with one slash, not two, and the next character is a tab, not a
 * backslash — yet resolves to `https://evil.example/`. Parsing the candidate
 * the same way the eventual consumer will, and comparing the *resulting*
 * origin, has no such gap: whatever the parser strips, it strips before the
 * comparison too.
 *
 * A candidate carrying a raw CR, LF or NUL byte can still pass — those bytes
 * do not change the parsed origin — and is returned to the caller unchanged,
 * byte for byte; harmless, since a browser strips CR/LF the same way this
 * parser does before it ever requests the destination and the value never
 * reaches a response header, but it does mean the string handed back is not
 * always byte-identical to what ultimately loads.
 *
 * @param candidate - the caller-supplied destination, entirely untrusted.
 * @returns true only for a rooted, same-origin path.
 */
export function isInternalPath(candidate: string): boolean {
  if (!candidate.startsWith("/")) return false;
  try {
    return (
      new URL(candidate, "https://h.invalid").origin === "https://h.invalid"
    );
  } catch {
    return false;
  }
}
