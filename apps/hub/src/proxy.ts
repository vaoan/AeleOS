import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/shared/infrastructure/i18n/routing";
import { isPublicRoute } from "@/features/session";
import { signInUrlFor } from "@/shared/infrastructure/request-locale";

/**
 * Locale negotiation: redirects to a prefixed URL and picks the language.
 *
 * Detection is next-intl's default, reading `Accept-Language`, so a visitor
 * gets their browser's language when we support it and Spanish when we do not.
 */
const intlMiddleware = createIntlMiddleware(routing);

/**
 * Matches `/api` and `/trpc`, and nothing that merely starts with those
 * letters.
 *
 * Deliberately **not** the `"/(api|trpc)(.*)"` shape `config.matcher` uses
 * below. That shape has no `/` boundary, so it also matches `/apidocs`,
 * `/apikeys` and `/trpcx` — harmless in `config.matcher`, where over-matching
 * only means the middleware runs and then does nothing, but not harmless
 * here: a match here skips locale negotiation entirely, so `/apidocs` would
 * silently stop getting a `/es` prefix and a locale cookie.
 *
 * Written out rather than expressed with Clerk's `createRouteMatcher`, which is
 * deprecated. This never needed a pattern language: the rule is "the segment is
 * exactly `api`", and saying that directly is both shorter and impossible to
 * get subtly wrong. Measured directly
 * — `curl -i` against a running dev server showed `/docs` still redirecting
 * to `/es/docs` while a route matched by the broad pattern did not redirect
 * at all, just a bare 404 with no cookie. `public-routes.ts` drew the same
 * boundary for `/sign-in`, via {@link isPublicRoute}, for the identical
 * reason; `isApiRoute` follows it.
 *
 * Exported so `tests/proxy.test.ts` can assert the boundary directly —
 * `src/proxy.ts` sits outside the coverage `include`, so a passing test suite
 * proves nothing about this file unless something calls it on purpose.
 *
 * @param request - the incoming request.
 * @returns true when the path is an API or tRPC route.
 */
export function isApiRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return ["/api", "/trpc"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Auth and locale, in that order.
 *
 * Clerk runs first because the protection decision must not depend on locale
 * negotiation: whether a route needs a session is a property of the route, and
 * `isPublicRoute` matches both the unprefixed path Clerk sees on a first hit
 * and every locale-prefixed form.
 *
 * The intl middleware's response is returned so its redirect and its locale
 * cookie survive; Clerk merges its own headers into whatever the handler
 * returns. When `auth.protect()` redirects, it short-circuits and the intl
 * middleware never runs — which is correct, because there is no page to
 * localise.
 *
 * `unauthenticatedUrl` is not optional in practice. Without it Clerk redirects
 * to its hosted Account Portal, whose handshake returns through a synthetic
 * path segment; the `[locale]` route rejects that as an unknown locale, so
 * every protected page answered 404 instead of showing a sign-in page.
 *
 * Named `proxy` for Next 16, which deprecated the `middleware` convention and
 * warned on every build until this moved.
 *
 * It is no longer the only thing protecting a route: the signed-in layout calls
 * `auth.protect()` itself. This stays as the outer gate because redirecting
 * here avoids rendering a page nobody may see.
 *
 * The intl middleware only runs for page paths. `/api/actors/mine` is the
 * first route under `/api`, and calling `intlMiddleware(request)`
 * unconditionally was measured — with `curl -i` against a running dev
 * server — to 307 *every* API request to a locale-prefixed URL
 * (`/api/actors/mine` → `/es/api/actors/mine`), because next-intl redirects
 * any path that reaches it without a locale segment. An API response has no
 * locale to negotiate, and a server-to-server caller cannot follow a
 * redirect into JSON. Skipping the intl middleware here answers with
 * whatever the route handler (or Clerk's own `auth.protect()` redirect for a
 * still-protected route) already decided.
 */
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: signInUrlFor(
        request.nextUrl.pathname,
        request.url,
        request.nextUrl.search,
      ),
    });
  }
  if (isApiRoute(request)) return;
  return intlMiddleware(request);
});

export const config = {
  matcher: [
    // Skip Next internals and static files, but always run for API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
