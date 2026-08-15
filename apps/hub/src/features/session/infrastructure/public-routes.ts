import type { NextRequest } from "next/server";
import { routing } from "@/shared/infrastructure/i18n/routing";

/**
 * Routes reachable without a session, for every supported locale.
 *
 * Built from `routing.locales` rather than written out, because the two must
 * not drift: adding a locale without adding its sign-in route would make that
 * language's sign-in page require a session to reach — an unreachable login.
 *
 * `/:locale/sign-in/(.*)` rather than `/:locale/sign-in(.*)`: the latter
 * matches any path that merely starts with the string, so a later
 * `/es/sign-in-admin` would be public without anyone deciding it was. The
 * boundary is the path separator.
 *
 * The unprefixed forms stay because the proxy protects before next-intl has
 * rewritten the URL, so `/sign-in` is what Clerk actually sees on a first hit.
 *
 * This list is the whole definition of what is reachable signed-out, and there
 * is no second check in the proxy — adding an entry makes a route public. Every
 * entry needs a case in `tests/public-routes.test.ts`.
 *
 * The public actor pages are the one entry that could not be written as a path
 * pattern. They are addressed as `/{locale}/{person}` and
 * `/{locale}/{person}/{handle}`, where an address is shaped **exactly** like
 * the static segment of a signed-in route — `/es/42` and `/es/pages` are the
 * same shape. A `/${locale}/:person` pattern would therefore have made every
 * signed-in page public at this layer.
 *
 * That would not have been a hole, because the `(app)` layout calls
 * `auth.protect()` itself, but it would have thrown away the outer gate for no
 * reason. `PUBLIC_ACTOR_PAGES` keeps it by excluding the static segments
 * explicitly. Two notes for whoever edits it:
 *
 * - The exclusion is `(name)(\/|$)`, not `name$`. Anchoring to the end alone
 *   lets `/es/fursonas/new` through, because `fursonas$` does not match when
 *   more path follows — which is how the first draft of this quietly made the
 *   whole editor public.
 * - It is a `RegExp`, not a path pattern with a custom parameter. `:person(…)`
 *   syntax was removed in path-to-regexp v8 and is silently ignored rather than
 *   rejected, so the constraint appeared to work while matching everything.
 *   Measured both ways before choosing.
 *
 * `/api/actors/mine` is the one entry that is not reachable signed-out in the
 * ordinary sense — it is a server-to-server endpoint that still requires a
 * Clerk session, just not one the *proxy* checks. Left off this list, an
 * unauthenticated request gets `auth.protect()`'s 307 to an HTML sign-in
 * page, which a server-side caller cannot parse as the actor list it asked
 * for (confirmed against a running dev server — `curl -i` returned exactly
 * that redirect before this entry was added). Listing it here lets the
 * request through to the route handler, whose own `auth()` check answers
 * `401` JSON instead.
 */
/**
 * Every locale-prefixed actor page, and nothing that belongs to a session.
 *
 * Built from `routing.locales` and the static segments of `[locale]/(app)/` so
 * neither can drift: a new signed-in section must be added to `RESERVED`, or
 * its pages become public at the proxy — the layout would still protect them,
 * but the outer gate would stop doing its job silently.
 */
// `fursonas` is retired as a section and STILL RESERVED. Freeing it would let
// somebody take it as a vanity address, and every link anybody had shared to
// their own list would begin resolving to that stranger's profile — the same
// reasoning that never frees a handle. It still routes, to a redirect.
const RESERVED = ["me", "picker", "pages", "fursonas", "sign-in"].join("|");

const PUBLIC_ACTOR_PAGES = routing.locales.map(
  (locale) =>
    new RegExp(
      `^/${locale}/(?!(${RESERVED})(/|$))[a-z0-9][a-z0-9_-]*(/[a-zA-Z0-9][a-zA-Z0-9_-]*)?$`,
    ),
);

const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-in/(.*)",
  "/api/actors/mine",
  ...routing.locales.flatMap((locale) => [
    `/${locale}`,
    `/${locale}/sign-in`,
    `/${locale}/sign-in/(.*)`,
  ]),
  ...PUBLIC_ACTOR_PAGES,
];

/**
 * Turns one of the path patterns above into an anchored regular expression.
 *
 * **The vocabulary is deliberately tiny**: a literal path, optionally with
 * `(.*)` standing for "and anything under it". Everything else is escaped. That
 * is the whole of what this app's patterns use, and keeping it that small is
 * the point — the previous matcher understood a much larger grammar, and this
 * file has already been bitten once by a piece of it changing underneath us:
 * `:person(…)` constraints were removed in path-to-regexp v8 and were silently
 * IGNORED rather than rejected, so a pattern that looked constrained matched
 * everything.
 *
 * Anchored at both ends, so `/sign-in` cannot match `/sign-in-admin` — the
 * boundary this file's notes are most insistent about.
 *
 * @param pattern - the path pattern to compile.
 * @returns an anchored expression matching exactly that pattern.
 */
function pathPattern(pattern: string): RegExp {
  const literals = pattern
    .split("(.*)")
    .map((part) => part.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`));
  return new RegExp(`^${literals.join(".*")}$`);
}

const PUBLIC_PATTERNS = PUBLIC_ROUTES.map((route) =>
  typeof route === "string" ? pathPattern(route) : route,
);

/**
 * Whether a request may be served without a session.
 *
 * **Ours rather than Clerk's `createRouteMatcher`**, which is deprecated: Clerk
 * is moving auth decisions to the resource because middleware path-matching can
 * diverge from how Next actually routes a request, leaving something protected
 * reachable. That argument is already answered here — the `(app)` layout checks
 * the session itself, and its note says so — which is exactly why this one may
 * stay a path check without being the guarantee.
 *
 * What it guards is the OUTER gate: redirecting before a page renders, and
 * carrying the destination into the sign-in URL so the app handoff survives it.
 * `picker.spec.ts` pins that contract. Moving this decision into the layout
 * would lose it, because a layout is not told the path it was reached by.
 *
 * @param request - the incoming request.
 * @returns true when no session is required to reach it.
 */
export function isPublicRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return PUBLIC_PATTERNS.some((pattern) => pattern.test(pathname));
}
