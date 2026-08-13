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
 * is no second check anywhere — adding an entry makes a route public. Every
 * entry needs a case in `tests/public-routes.test.ts`.
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
];

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);
