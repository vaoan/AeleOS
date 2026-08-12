import { clerkMiddleware } from "@clerk/nextjs/server";
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
 */
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: signInUrlFor(request.nextUrl.pathname, request.url),
    });
  }
  return intlMiddleware(request);
});

export const config = {
  matcher: [
    // Skip Next internals and static files, but always run for API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
