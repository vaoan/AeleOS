/** The attribute Playwright's `getByTestId` reads by default. */
export const TID_ATTR = "data-testid";

/**
 * Spreadable test-id attributes for an element.
 *
 * Mirrors Libra's `shared/utils/tid` so a selector reads the same in both
 * repositories, with one deliberate difference: **AeleOS always emits the
 * attribute.** Libra strips it from production builds unless a flag is set.
 *
 * That cannot work here. This app's end-to-end suite is run against the
 * deployed production URL as a smoke test — `PLAYWRIGHT_BASE_URL` pointed at
 * `me.furrycolombia.com` is part of the release check — and a suite that may
 * only select by test id cannot select anything if production strips them. The
 * cost is a handful of bytes of markup; the alternative is a release check that
 * silently tests nothing.
 *
 * Spread the result onto an element: `tid("nebula-toggle")` yields the
 * attribute Playwright's `getByTestId("nebula-toggle")` looks for.
 *
 * @param id - the test id, kebab-case and stable across copy changes.
 * @returns attributes to spread onto a JSX element.
 */
export function tid(id: string): Record<string, string> {
  return { [TID_ATTR]: id };
}
