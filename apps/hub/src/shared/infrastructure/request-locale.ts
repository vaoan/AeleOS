import { routing } from "@/shared/infrastructure/i18n/routing";
import { isInternalPath } from "@/shared/domain/return-to";

/**
 * The locale a request URL is already prefixed with, or the default.
 *
 * Reads the prefix rather than the `Accept-Language` header because this is
 * used after next-intl has redirected, when the URL is the authoritative
 * answer: sending someone browsing `/en/me` to a Spanish sign-in page because
 * their browser header says so would change language mid-journey.
 *
 * @param pathname - the request path, with or without a locale prefix.
 * @returns a locale from {@link routing}, never an arbitrary segment.
 */
export function localeFromPathname(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  return routing.locales.includes(segment) ? segment : routing.defaultLocale;
}

/**
 * Where to send an unauthenticated visitor, in their current language.
 *
 * Passed to Clerk's `auth.protect()` so it redirects to our own sign-in page.
 * Without it Clerk falls back to its hosted Account Portal, which is wrong
 * twice over: people must never land on a Clerk-branded address, and the
 * portal's handshake returns through a synthetic path segment that the
 * `[locale]` route then rejects as an unknown locale — a 404 instead of a
 * sign-in page.
 *
 * `pathname` and `search` are folded into a single `redirect_url` query
 * parameter (via `URLSearchParams.set`, so it is correctly encoded even when
 * the destination itself carries a `?`) so the sign-in page can send the
 * visitor on to where they were actually headed once they have a session —
 * see `resolveAfterSignInUrl`. It is omitted when the destination is just
 * `/`: there is nowhere useful to return to, and every visitor already lands
 * on their profile by default.
 *
 * @param pathname - the path being protected.
 * @param base - the request URL, used to resolve the absolute redirect.
 * @param search - the request's query string (including its leading `?`, or
 * empty), carried along so the destination round-trips exactly.
 * @returns an absolute URL to the localised sign-in page.
 */
export function signInUrlFor(
  pathname: string,
  base: string,
  search = "",
): string {
  const url = new URL(`/${localeFromPathname(pathname)}/sign-in`, base);
  const destination = `${pathname}${search}`;
  if (destination !== "/") {
    url.searchParams.set("redirect_url", destination);
  }
  return url.toString();
}

/**
 * Whether a same-origin path is the sign-in page itself, ignoring locale.
 *
 * Not a security check — the caller has already proven the destination stays
 * on this origin. This is a product rule: sending someone freshly signed in
 * back to the sign-in page shows them provider buttons for a session that
 * already exists, which is confusing rather than dangerous, so it is applied
 * here rather than folded into {@link isInternalPath}.
 *
 * @param pathname - the destination's path, already proven internal.
 * @returns true for `/{locale}/sign-in`, with or without a trailing slash.
 */
function isSignInRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length === 2 &&
    routing.locales.includes(segments[0] ?? "") &&
    segments[1] === "sign-in"
  );
}

/**
 * Where to land once a person has a session, in their current language.
 *
 * The sign-in page passes this as `afterSignInUrl`. `raw` is whatever arrived
 * in the `redirect_url` query parameter Clerk hands back unchanged — entirely
 * caller-supplied, and used only after authentication succeeds, which is the
 * classic post-login open redirect shape. `isInternalPath` is the only
 * security check: the destination is validated as internal on the way out,
 * never trusted because it looks plausible. A destination that is internal
 * but names the sign-in page itself is refused too, for a different reason —
 * see {@link isSignInRoute}.
 *
 * Typed `unknown` rather than `string | null` and never throws, on purpose:
 * Next's `searchParams` reports a repeated query key (`?redirect_url=a&redirect_url=b`)
 * as an array, not a string, so a caller that only typed the string case can
 * still hand this a value that is not one. An unauthenticated visitor with a
 * malformed, hostile, or wrongly-shaped `redirect_url` must still be able to
 * sign in, so anything that is not a plain string, or that is a string but
 * fails the checks above, silently falls back to the profile rather than
 * erroring — a refused destination is an attack or a mistake, and neither
 * deserves a message that helps.
 *
 * @param raw - the `redirect_url` query parameter, in whatever shape the
 * caller happened to read it.
 * @param locale - the locale to land in, from {@link localeFromPathname}.
 * @returns `raw` when it is a same-origin path that is not the sign-in page,
 * otherwise `/{locale}/me`.
 */
export function resolveAfterSignInUrl(raw: unknown, locale: string): string {
  const fallback = `/${locale}/me`;
  if (typeof raw !== "string" || !isInternalPath(raw)) return fallback;
  const { pathname } = new URL(raw, "https://h.invalid");
  return isSignInRoute(pathname) ? fallback : raw;
}
