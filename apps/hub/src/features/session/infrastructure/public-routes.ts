import { createRouteMatcher } from "@clerk/nextjs/server";
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
 * the static segment of a signed-in route — `/es/42` and `/es/fursonas` are the
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
const RESERVED = ["me", "picker", "fursonas", "sign-in"].join("|");

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

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);
