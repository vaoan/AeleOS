import { routing } from "@/shared/infrastructure/i18n/routing";

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
 * @param pathname - the path being protected.
 * @param base - the request URL, used to resolve the absolute redirect.
 * @returns an absolute URL to the localised sign-in page.
 */
export function signInUrlFor(pathname: string, base: string): string {
  return new URL(`/${localeFromPathname(pathname)}/sign-in`, base).toString();
}
