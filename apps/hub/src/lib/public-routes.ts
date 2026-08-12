import { createRouteMatcher } from "@clerk/nextjs/server";
import { routing } from "@/i18n/routing";

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
 */
const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-in/(.*)",
  ...routing.locales.flatMap((locale) => [
    `/${locale}`,
    `/${locale}/sign-in`,
    `/${locale}/sign-in/(.*)`,
  ]),
];

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);
